import type { I18nRuntime } from '@ai-i18n/core';
import { useSyncExternalStore } from 'react';

export interface ReactI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ReturnType<I18nRuntime['getLang']>;
  langs: ReturnType<I18nRuntime['getLangs']>;
}

export function createReactI18n(runtime: I18nRuntime): () => ReactI18n {
  let revision = 0;
  const listeners = new Set<() => void>();
  const langs = runtime.getLangs();

  runtime.subscribe(() => {
    revision += 1;
    listeners.forEach((listener) => listener());
  });

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return function useI18n() {
    useSyncExternalStore(
      subscribe,
      () => revision,
      () => revision,
    );
    return {
      t: runtime.t,
      setLang: runtime.setLang,
      currentLang: runtime.getLang(),
      langs,
    };
  };
}
