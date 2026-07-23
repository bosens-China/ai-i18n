import type { I18nRuntime, LangOption } from '@ai-i18n/core';
import { computed, readonly, shallowRef } from 'vue';
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue';
import {
  getLang,
  getLangs,
  setLang,
  subscribe,
  t as runtimeT,
} from 'virtual:ai-i18n';

const revision = shallowRef(0);
const langs = readonly(shallowRef(getLangs()));
const trackRevision = () => revision.value;

subscribe(() => {
  revision.value += 1;
});

export function useI18n(): {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ComputedRef<string>;
  langs: DeepReadonly<ShallowRef<readonly LangOption[]>>;
} {
  const currentLang = computed(() => {
    trackRevision();
    return getLang();
  });
  const t = (source: string, comment?: string) => {
    trackRevision();
    return runtimeT(source, comment);
  };

  return { t, setLang, currentLang, langs };
}
