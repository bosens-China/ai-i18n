import type { I18nRuntime } from '@ai-i18n/core';
import { useCallback, useSyncExternalStore } from 'react';

export interface ReactI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ReturnType<I18nRuntime['getLang']>;
  langs: ReturnType<I18nRuntime['getLangs']>;
}

export function createReactI18n(runtime: I18nRuntime): () => ReactI18n {
  let runtimeRevision = 0;
  const listeners = new Set<() => void>();
  const langs = runtime.getLangs();

  runtime.subscribe(() => {
    runtimeRevision += 1;
    listeners.forEach((listener) => listener());
  });

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return function useI18n() {
    const revision = useSyncExternalStore(
      subscribe,
      () => runtimeRevision,
      () => runtimeRevision,
    );
    // React Compiler 会按函数引用缓存调用结果，语言更新时必须让 t 的引用同步变化。
    const t = useCallback(
      (source: string, comment?: string) => runtime.t(source, comment),
      [revision, runtime],
    );
    return {
      t,
      setLang: runtime.setLang,
      currentLang: runtime.getLang(),
      langs,
    };
  };
}
