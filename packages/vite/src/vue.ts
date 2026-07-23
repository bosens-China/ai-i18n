import type { I18nRuntime, LangOption } from '@boses/core';
import { computed, readonly, shallowRef } from 'vue';
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue';

export interface VueI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ComputedRef<string>;
  langs: DeepReadonly<ShallowRef<readonly LangOption[]>>;
}

export function createVueI18n(runtime: I18nRuntime): () => VueI18n {
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
    const t = (source: string, comment?: string) => {
      trackRevision();
      return runtime.t(source, comment);
    };

    return { t, setLang: runtime.setLang, currentLang, langs };
  };
}
