<template>
  <div class="q-pa-md">
    <div class="q-pb-none row justify-between">
      <div class="text-h6">
        {{ title }}
      </div>
    </div>
    <vue-json-pretty
      :data="data"
      :show-icon="true"
      :show-line="false"
      :show-double-quotes="false"
      :deep="2"
    >
      <template #renderNodeValue="{ defaultValue }">
        <JsonNode :value="defaultValue" />
      </template>
    </vue-json-pretty>
  </div>
</template>

<script setup>
/*!
 * Copyright (c) 2022-2023 Digital Bazaar, Inc. All rights reserved.
 */
import { reactive } from "vue";
import JsonNode from "./JsonNode.vue";
import { useQuasar } from "quasar";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";

const state = reactive({
  copied: false,
});

const props = defineProps({
  title: {
    type: String,
    required: true,
  },
  data: {
    type: Object,
    required: true,
  },
});

const $q = useQuasar();

const copy = () => {
  navigator.clipboard.writeText(JSON.stringify(props.data, null, 2));
  state.copied = true;
  $q.notify({
    message: "JSON copied to clipboard.",
    icon: "fas fa-copy",
    position: "top",
  });
};
</script>

<!-- <style lang="scss" scoped>
.vjs-tree :deep(.vjs-indent-unit) {
  width: 1.3em;
}
</style> -->
