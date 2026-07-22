declare module 'virtual:ai-i18n' {
  import type { I18nRuntime } from '@ai-i18n/core';

  export const t: I18nRuntime['t'];
  export const setLang: I18nRuntime['setLang'];
  export const getLang: I18nRuntime['getLang'];
  export const getLangs: I18nRuntime['getLangs'];
  export const subscribe: I18nRuntime['subscribe'];
}
