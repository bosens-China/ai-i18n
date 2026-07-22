import { computed, readonly, shallowRef } from 'vue';
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

export function useI18n() {
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
