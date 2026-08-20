import type {
  I18nRuntime,
  LangLoadState,
  LangOption,
  MessageTree,
  TranslatedMessageTree,
  TranslationOptions,
} from '@ai-i18n/core';
import { computed, readonly, shallowRef, unref } from 'vue';
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue';
import {
  attachOccurrenceBinding,
  type OccurrenceBindable,
} from './translation-occurrence.js';

export interface VueI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ComputedRef<string>;
  langs: DeepReadonly<ShallowRef<readonly LangOption[]>>;
  langLoadState: ComputedRef<LangLoadState>;
  isLangLoading: ComputedRef<boolean>;
  langLoadError: ComputedRef<unknown | null>;
}

export type UseI18n = () => VueI18n;

export interface TranslateRef {
  (source: string, options?: TranslationOptions): ComputedRef<string>;
  (strings: TemplateStringsArray, ...values: unknown[]): ComputedRef<string>;
  <T extends MessageTree>(messages: T): ComputedRef<TranslatedMessageTree<T>>;
  __aiI18nAt(occurrence: string): TranslateRef;
}

export interface I18nComputedState {
  currentLang: () => string;
  langs: () => readonly LangOption[];
  langLoadState: () => LangLoadState;
  isLangLoading: () => boolean;
  langLoadError: () => unknown | null;
}

export type I18nComputed = () => I18nComputedState;

export interface TranslateComputed {
  (source: string, options?: TranslationOptions): () => string;
  (strings: TemplateStringsArray, ...values: unknown[]): () => string;
  <T extends MessageTree>(messages: T): () => TranslatedMessageTree<T>;
  __aiI18nAt(occurrence: string): TranslateComputed;
}

export interface VueI18nAdapter {
  t: I18nRuntime['t'];
  useI18n: UseI18n;
  tRef: TranslateRef;
  i18nComputed: I18nComputed;
  tComputed: TranslateComputed;
}

export function createVueI18nAdapter(
  runtime: I18nRuntime,
  scopedTranslate: I18nRuntime['t'] = runtime.t,
): VueI18nAdapter {
  const revision = shallowRef(0);
  const langs = readonly(shallowRef(runtime.getLangs()));
  type RuntimeTranslate = I18nRuntime['t'] &
    OccurrenceBindable<I18nRuntime['t']>;
  const translate = scopedTranslate as RuntimeTranslate;

  runtime.subscribe(() => {
    revision.value += 1;
  });

  function trackRevision() {
    return revision.value;
  }

  const currentLang = computed(() => {
    trackRevision();
    return runtime.getLang();
  });
  const langLoadState = computed(() => {
    trackRevision();
    return runtime.getLangLoadState();
  });
  const isLangLoading = computed(
    () => langLoadState.value.status === 'loading',
  );
  const langLoadError = computed(() => langLoadState.value.error);

  const createTrackedTranslate = (
    current: RuntimeTranslate,
  ): I18nRuntime['t'] => {
    const invoke = current as (
      source: unknown,
      ...values: unknown[]
    ) => unknown;
    return attachOccurrenceBinding(
      ((source: unknown, ...values: unknown[]) => {
        trackRevision();
        return invoke(source, ...values);
      }) as I18nRuntime['t'],
      (occurrence) => createTrackedTranslate(current.__aiI18nAt(occurrence)),
    );
  };
  const t = createTrackedTranslate(translate);

  // 在 computed 内解包插值 Ref，确保语言和动态插值任一变化都会重新计算。
  const createTranslateRef = (current: RuntimeTranslate): TranslateRef => {
    const invoke = current as (
      source: unknown,
      ...values: unknown[]
    ) => unknown;
    return attachOccurrenceBinding(
      ((source: unknown, ...values: unknown[]) =>
        computed(() => {
          trackRevision();
          return invoke(source, ...values.map(unref));
        })) as TranslateRef,
      (occurrence) => createTranslateRef(current.__aiI18nAt(occurrence)),
    );
  };
  const tRef = createTranslateRef(translate);

  // Options API 由 Vue 为每个组件实例创建 computed，这里只返回纯 getter。
  const createTranslateComputed = (
    current: RuntimeTranslate,
  ): TranslateComputed => {
    const invoke = current as (
      source: unknown,
      ...values: unknown[]
    ) => unknown;
    return attachOccurrenceBinding(
      ((source: unknown, ...values: unknown[]) =>
        () => {
          trackRevision();
          return invoke(source, ...values.map(unref));
        }) as TranslateComputed,
      (occurrence) => createTranslateComputed(current.__aiI18nAt(occurrence)),
    );
  };
  const tComputed = createTranslateComputed(translate);

  const i18nComputed: I18nComputed = () => ({
    currentLang: () => currentLang.value,
    langs: () => langs.value,
    langLoadState: () => langLoadState.value,
    isLangLoading: () => isLangLoading.value,
    langLoadError: () => langLoadError.value,
  });

  const useI18n: UseI18n = () => {
    return {
      t,
      setLang: runtime.setLang,
      currentLang,
      langs,
      langLoadState,
      isLangLoading,
      langLoadError,
    };
  };

  return { t, useI18n, tRef, i18nComputed, tComputed };
}

export function createVueI18n(runtime: I18nRuntime): UseI18n {
  return createVueI18nAdapter(runtime).useI18n;
}
