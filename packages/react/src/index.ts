import type { I18nRuntime } from '@ai-i18n/core';
import { useSyncExternalStore } from 'react';
import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n';

let revision = 0;
const listeners = new Set<() => void>();
const langs = getLangs();

subscribe(() => {
  revision += 1;
  listeners.forEach((listener) => listener());
});

function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const getSnapshot = () => revision;

export function useI18n(): {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ReturnType<I18nRuntime['getLang']>;
  langs: ReturnType<I18nRuntime['getLangs']>;
} {
  useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
  return { t, setLang, currentLang: getLang(), langs };
}
