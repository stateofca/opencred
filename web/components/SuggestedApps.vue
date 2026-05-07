<!--
Copyright 2023 - 2026 California Department of Motor Vehicles
Copyright 2023 - 2026 Digital Bazaar, Inc.

SPDX-License-Identifier: BSD-3-Clause
-->

<template>
  <div
    v-if="walletRows.length > 0"
    class="suggested-apps q-pa-md">
    <p
      class="text-body2 text-center q-mb-md"
      v-html="t('appInstallExplain')" />
    <div class="wallet-rows column q-gutter-y-sm">
      <div
        v-for="(row, idx) in visibleRows"
        :key="idx"
        class="wallet-row row items-center q-gutter-x-sm">
        <img
          v-if="row.icon"
          :src="row.icon"
          :alt="row.displayName"
          class="wallet-icon">
        <span class="wallet-name text-body2 text-weight-medium">
          {{row.displayName}}
        </span>
        <div class="row items-center q-gutter-x-xs q-ml-auto">
          <a
            v-for="(sf, sfIdx) in row.storefronts"
            :key="sfIdx"
            :href="sf.url"
            target="_blank"
            rel="noopener noreferrer"
            class="store-link">
            <img
              :src="storeInfo(sf.type).src"
              :alt="storeInfo(sf.type).alt"
              class="store-badge">
          </a>
        </div>
      </div>
    </div>
    <button
      v-if="collapsedCount > 0 && !showAll"
      class="show-more-btn text-body2 q-mt-sm"
      @click="showAll = true">
      Show {{collapsedCount}} more
      {{collapsedCount === 1 ? 'wallet' : 'wallets'}}
    </button>
  </div>
</template>

<script setup>
import {computed, ref} from 'vue';
import {useExchangeOptions} from '../composables/useExchangeOptions.js';
import {usePlatform} from '../composables/usePlatform.js';
import {useReactiveI18n} from '../composables/useReactiveI18n.js';
import {WALLETS_REGISTRY} from '../../common/wallets/index.js';

const {t} = useReactiveI18n();
const {exchangeOptions} = useExchangeOptions();
const {platform} = usePlatform();

const VISIBLE_THRESHOLD = 2;
const showAll = ref(false);

const walletRows = computed(() => {
  const opts = exchangeOptions.value;
  if(!opts) {
    return [];
  }

  const enabledWallets = [
    ...opts.defaultWallets,
    ...opts.extraWallets.filter(w => w.enabled)
  ];

  const plat = platform.value || {};
  const entries = [];
  for(const wallet of enabledWallets) {
    const reg = WALLETS_REGISTRY[wallet.walletId];
    if(!reg?.storefronts?.length) {
      continue;
    }
    let filtered = reg.storefronts;
    if(plat.isIOS) {
      filtered = filtered.filter(s => s.type === 'apple');
    } else if(plat.isAndroid) {
      filtered = filtered.filter(s => s.type === 'google');
    }
    if(filtered.length === 0) {
      continue;
    }
    entries.push({
      walletId: wallet.walletId,
      groupId: reg.groupId || reg.id,
      name: reg.name || wallet.walletId,
      icon: reg.icon || null,
      storefronts: filtered
    });
  }

  // Group wallets that share a groupId into one row
  const groups = [];
  const groupIndex = new Map();
  for(const entry of entries) {
    const key = entry.groupId;
    if(groupIndex.has(key)) {
      const group = groups[groupIndex.get(key)];
      const seen = new Set(group.storefronts.map(s => s.url));
      for(const sf of entry.storefronts) {
        if(!seen.has(sf.url)) {
          group.storefronts.push(sf);
          seen.add(sf.url);
        }
      }
    } else {
      groupIndex.set(key, groups.length);
      groups.push({
        displayName: entry.name.replace(/\s*\((?:Android|iOS)\)\s*$/, ''),
        icon: entry.icon,
        storefronts: [...entry.storefronts]
      });
    }
  }

  return groups;
});

const visibleRows = computed(() => {
  if(showAll.value || walletRows.value.length <= VISIBLE_THRESHOLD) {
    return walletRows.value;
  }
  return walletRows.value.slice(0, VISIBLE_THRESHOLD);
});

const collapsedCount = computed(() => {
  if(walletRows.value.length <= VISIBLE_THRESHOLD) {
    return 0;
  }
  return walletRows.value.length - VISIBLE_THRESHOLD;
});

function storeInfo(type) {
  switch(type) {
    case 'apple':
      return {
        src: '/apple-app-store-button.png',
        alt: 'Download on the App Store'
      };
    case 'google':
      return {
        src: '/google-play-button.png',
        alt: 'Get it on Google Play'
      };
    default:
      return {};
  }
}
</script>

<style scoped>
.suggested-apps {
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 0 0 8px 8px;
  background: rgba(0, 0, 0, 0.02);
  width: 100%;
  max-width: 400px;
}

.wallet-row {
  min-height: 40px;
}

.wallet-icon {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  object-fit: contain;
}

.wallet-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.store-link {
  display: inline-flex;
  align-items: center;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
}

.store-link:hover {
  opacity: 0.8;
}

.store-badge {
  height: 28px;
  width: auto;
}

.show-more-btn {
  display: block;
  width: 100%;
  padding: 4px 0;
  background: none;
  border: none;
  color: var(--q-primary, #1976d2);
  cursor: pointer;
  text-align: center;
  text-decoration: underline;
}

.show-more-btn:hover {
  opacity: 0.8;
}
</style>
