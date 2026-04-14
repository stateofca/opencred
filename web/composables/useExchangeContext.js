import {computed, inject, provide} from 'vue';

const EXCHANGE_CTX = 'exchangeContext';

export function useExchangeContext() {
  const provideContext = ({context}) => provide(EXCHANGE_CTX, context);
  const context = inject(EXCHANGE_CTX, null);

  const workflow = computed(() => context.value.workflow);
  const translations = computed(() => workflow.value?.translations ?? {});
  const brand = computed(() => workflow.value?.brand ?? {});

  return {
    provideContext,
    context,
    workflow,
    translations,
    brand
  };
}
