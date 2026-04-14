import {useI18n} from 'vue-i18n';
import {watch} from 'vue';

export function useReactiveI18n({messages}) {
  const i18n = useI18n({useScope: 'local'});

  watch(messages, msgs => {
    for(const [locale, msg] of Object.entries(msgs || {})) {
      i18n.mergeLocaleMessage(locale, msg);
    }
  }, {immediate: true, deep: true});

  return {...i18n};
}
