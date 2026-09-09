# DC API launch: profiles → buttons / QR

How a CA-DMV-shaped workflow (two configured `dcApiButtons`: an Apple lane and a
Google lane) resolves to what the user sees, by platform and DC API availability.
Reflects [platform-gated DC API buttons](../adr/2026-09-09-platform-gated-dc-api-buttons.md).

```mermaid
flowchart TD
    start([Exchange page loads]) --> dcapi{"DC API available?\n(navigator.credentials\n+ window.DigitalCredential)"}

    dcapi -- No --> qr["QR / link fallback\n(OID4VP over qr-and-link)\nOne QR code"]
    dcapi -- "No (Samsung Internet)" --> qr

    dcapi -- Yes --> plat{Platform?}

    plat -- iOS --> ios["Apple lane only\nprofile: apple-wallet (signed Annex C)\nGoogle lane hidden"]
    plat -- Android --> android["Google lane only\nprofile: google-wallet (Annex D)\nApple lane hidden"]
    plat -- "Desktop" --> desktop["Both lanes shown\n(each launch = cross-device QR,\ndesktopLabelKey)"]

    ios --> oneBtnIos["ONE button, label = labelKey\n(CA DMV: dcApiButton_openWallet_label\n= 'Open Wallet')"]
    android --> oneBtnAnd["ONE button, label = labelKey\n(CA DMV: dcApiButton_openWallet_label\n= 'Open Wallet')"]
    desktop --> twoBtn["TWO buttons, label = desktopLabelKey\n(CA DMV: dcApiButton_iosWallet_label\n'Continue with Apple Device' /\ndcApiButton_androidWallet_label\n'Continue with Android Device'),\neach opens a QR"]

    oneBtnIos --> hint["Compatibility hint shown\nONCE below the button group"]
    oneBtnAnd --> hint
    twoBtn --> hint

    hint --> tap([User taps a button]) --> get["navigator.credentials.get()\nwith that button's single profile"]
    qr --> scan([User scans QR on phone])
```

## How the gating is decided

- **DC API availability** is a feature check (`dcApiSystemAvailable`), not a
  version check. iOS ≈ 18 and older, and Samsung Internet, land in the QR/link
  fallback automatically.
- **Platform gating** is derived from the wallet registry: a button shows only
  when one of its handling wallets declares the current platform
  (`apple-wallet` → `ios`, `google-wallet` → `android`). Desktop is never gated.
- **Each lane sends one profile.** No signed+unsigned bundling and no iOS version
  tiers — so the "older iOS can't carry multiple protocols in one request"
  concern does not arise. See the ADR's "Decisions → 2" for why.

## Where button labels come from

Labels are **config-driven**, not code defaults. `resolveLabel()` in
`DcApiInteraction.vue` picks, in order:

1. `desktopLabelKey` — used only on **desktop** (the launch is a cross-device QR
   flow), when the key resolves in the current locale.
2. `labelKey` — the button's `labelKey`, when it resolves. This is the mobile
   label (and the desktop label if no `desktopLabelKey`).
3. literal `label` on the button.
4. `dcApiSingleProfile_buttonLabel` — the only code-side fallback ("Open in
   wallet"), used when nothing above resolves.

`isMobile` there is iOS OR Android; "desktop" is anything else.

The CA DMV deployed config (workflows.tf / config.tftpl) sets, per lane:

| Key | Value | Shown when |
|---|---|---|
| `dcApiButton_openWallet_label` | "Open Wallet" | mobile (both lanes' `labelKey`) |
| `dcApiButton_iosWallet_label` | "Continue with Apple Device" | desktop, Apple lane (`desktopLabelKey`) |
| `dcApiButton_androidWallet_label` | "Continue with Android Device" | desktop, Android lane (`desktopLabelKey`) |

So on mobile the single visible button reads **"Open Wallet"**; on desktop the
two buttons read "Continue with Apple Device" / "Continue with Android Device".
These strings live in config and can change without a code change — the diagram
names the keys, not fixed text.

## Profile → wire protocol reference

| Lane | Button profile | Wire protocol | Wallet |
|---|---|---|---|
| Apple | `apple-wallet` | `org-iso-mdoc` (signed, `readerAuthAll`) | Apple Wallet |
| Google | `google-wallet` | `openid4vp-v1-signed` (`x509_hash`) | Google Wallet |
| Fallback | OID4VP default (e.g. `OID4VP-draft18`) | QR / link | any OID4VP wallet |

`cadmv-ios` and `18013-7-Annex-C` are the same unsigned `org-iso-mdoc` request
(no `readerAuthAll`); the deployed config uses the signed `apple-wallet` instead.
A single button may not carry two `org-iso-mdoc` profiles (validator ban).
