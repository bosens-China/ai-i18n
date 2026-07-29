import type {
  I18nRuntime,
  LangLoadState,
  LangOption,
  TranslationOptions,
} from '@ai-i18n/core';
import { computed, readonly, shallowRef, unref } from 'vue';
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue';

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
}

export interface VueI18nAdapter {
  useI18n: UseI18n;
  tRef: TranslateRef;
}

export function createVueI18nAdapter(runtime: I18nRuntime): VueI18nAdapter {
  const revision = shallowRef(0);
  const langs = readonly(shallowRef(runtime.getLangs()));
  const translate = runtime.t as (
    source: string | TemplateStringsArray,
    ...values: unknown[]
  ) => string;

  runtime.subscribe(() => {
    revision.value += 1;
  });

  function trackRevision() {
    return revision.value;
  }

  const t = ((source: string | TemplateStringsArray, ...values: unknown[]) => {
    trackRevision();
    return translate(source, ...values);
  }) as I18nRuntime['t'];

  // 在 computed 内解包插值 Ref，确保语言和动态插值任一变化都会重新计算。
  const tRef = ((source: string | TemplateStringsArray, ...values: unknown[]) =>
    computed(() => {
      trackRevision();
      return translate(source, ...values.map(unref));
    })) as TranslateRef;

  const useI18n: UseI18n = () => {
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

  return { useI18n, tRef };
}

export function createVueI18n(runtime: I18nRuntime): UseI18n {
  return createVueI18nAdapter(runtime).useI18n;
}
