import { useSyncExternalStore } from 'react';
import {
  getLang,
  getLangs,
  setLang,
  subscribe,
  t,
} from 'virtual:ai-i18n';

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

export function useI18n() {
  useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
  return { t, setLang, currentLang: getLang(), langs };
}
