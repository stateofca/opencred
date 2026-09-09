# Platform-gated DC API buttons

- Status: accepted
- Date: 2026-09-09

## Context

Builds on [2026-07-29-multi-profile-dc-api-requests](./2026-07-29-multi-profile-dc-api-requests.md),
which lets one `navigator.credentials.get()` call carry several profiles.

The CA DMV mDL login shows two DC API launch lanes:

- **Apple lane (Annex C, `org-iso-mdoc`)** — Apple Wallet. The deployed config
  uses the signed `apple-wallet` profile (`readerAuthAll`), with an
  `apple-wallet` `walletCertificates` entry configured.
- **Google lane (Annex D, `openid4vp-v1-signed`)** — Google Wallet.

Two problems with the current behavior:

1. **Both buttons show on every platform.** Configured `dcApiButtons` are not
   platform-filtered (`_configuredDescriptors`, `exchange-options.js`), so an iOS
   user sees the Google-lane button and vice versa, even though the wallet that
   answers it cannot run on that platform.
2. **The compatibility helper line double-renders.** It sits inside the
   per-button loop (`DcApiInteraction.vue`), so with two buttons it prints twice.

## Decisions

### 1. Derive a button's platforms from its profiles/registry — no new config

A configured button shows only on the platform(s) its handling wallets support.
`_configuredDescriptors` already computes `walletIds` (the wallets whose
`supportedProfiles[profile].dcapi` matches the button's profiles). Take the union
of `registry[walletId].platform` across those wallets as the button's platforms,
and drop the button when the current mobile platform is excluded. Reuses the
existing gate pattern in `_profileCompat`. No `platforms:` config field is added;
existing QA/UAT/PROD button configs get the behavior for free.

**Desktop shows all buttons** (the DC API launch becomes a cross-device QR flow,
labeled via `desktopLabelKey`). Gating applies only when `platform.isIOS` or
`platform.isAndroid` is true.

### 2. Each lane sends a single profile — no bundling, no iOS version branching

The iOS button sends the single signed `apple-wallet` profile; the Android button
sends `google-wallet`. Neither bundles multiple protocols in one request.

This deliberately does **not** implement signed + unsigned Annex-C bundling or
iOS version tiers. The concern that older iOS (< 26.4) cannot carry multiple
protocols in one `navigator.credentials.get()` call only applies when bundling;
sending one profile sidesteps it entirely. iOS without the Digital Credentials
API (≈ 18 and older) is already handled by the existing `dcApiSystemAvailable`
feature check — the DC API entry is suppressed and the flow falls back to
QR/link. No User-Agent version parsing is added.

`cadmv-ios` and `18013-7-Annex-C` produce the identical unsigned Annex C request
(same `generateAnnexC` handler, no `readerAuthAll`); only `apple-wallet` is
signed. The `validateDcApiButtons` same-protocol collision ban stays as-is: a
single button must not carry two `org-iso-mdoc` profiles.

### 3. Hoist the compatibility helper line

Move the `dcApiSingleProfile_handledBy` / `_handledByNone` `<p>` out of the
per-descriptor `v-for` in `DcApiInteraction.vue` to render once below the button
group (gated on any non-wallet-branded descriptor). Fixes the double-render that
caused the config to blank the key.

## Consequences

- No config change needed for platform gating; QA/UAT/PROD button configs work
  as-is. UAT/PROD still use a single combined button and would migrate to the
  two-lane model separately.
- If a future requirement needs an unsigned Annex-C fallback for some iOS
  versions, that reopens the bundling/version-tier question this ADR declined —
  revisit then, with an on-device test of which iOS versions accept the signed
  `apple-wallet` request.
- The eval/verification gate is per-platform on-device testing: iOS (Apple lane
  only), Android (Google lane only), desktop (both lanes, QR).
