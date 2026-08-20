import type { I18nRuntime, LangLoadState } from '@ai-i18n/core';
import { useCallback, useSyncExternalStore } from 'react';
import { attachOccurrenceBinding } from './translation-occurrence.js';

export interface ReactI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ReturnType<I18nRuntime['getLang']>;
  langs: ReturnType<I18nRuntime['getLangs']>;
  langLoadState: LangLoadState;
  isLangLoading: boolean;
  langLoadError: unknown | null;
}

export type UseI18n = () => ReactI18n;

export function createReactI18n(
  runtime: I18nRuntime,
  scopedTranslate: I18nRuntime['t'] = runtime.t,
): UseI18n {
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
    const translate = scopedTranslate;
    const invoke = translate as (
      source: unknown,
      ...values: unknown[]
    ) => unknown;
    const callback = useCallback(
      ((source: unknown, ...values: unknown[]) =>
        invoke(source, ...values)) as I18nRuntime['t'],
      [revision, translate],
    );
    const t = attachOccurrenceBinding(callback, (occurrence) =>
      translate.__aiI18nAt(occurrence),
    );
    const langLoadState = runtime.getLangLoadState();
    return {
      t,
      setLang: runtime.setLang,
      currentLang: runtime.getLang(),
      langs,
      langLoadState,
      isLangLoading: langLoadState.status === 'loading',
      langLoadError: langLoadState.error,
    };
  };
}
