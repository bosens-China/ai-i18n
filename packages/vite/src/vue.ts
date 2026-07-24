import type { I18nRuntime, LangOption } from '@ai-i18n/core';
import { computed, readonly, shallowRef } from 'vue';
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue';

export interface VueI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ComputedRef<string>;
  langs: DeepReadonly<ShallowRef<readonly LangOption[]>>;
}

export type UseI18n = () => VueI18n;

export function createVueI18n(runtime: I18nRuntime): UseI18n {
  const revision = shallowRef(0);
  const langs = readonly(shallowRef(runtime.getLangs()));

  runtime.subscribe(() => {
    revision.value += 1;
  });

  function trackRevision() {
    return revision.value;
  }

  return function useI18n() {
    const currentLang = computed(() => {
      trackRevision();
      return runtime.getLang();
    });
    const translate = runtime.t as (
      source: string | TemplateStringsArray,
      ...values: unknown[]
    ) => string;
    const t = ((
      source: string | TemplateStringsArray,
      ...values: unknown[]
    ) => {
      trackRevision();
      return translate(source, ...values);
    }) as I18nRuntime['t'];

    return { t, setLang: runtime.setLang, currentLang, langs };
  };
}
