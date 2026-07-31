export const RUNTIME_AUTO_IMPORTS = [
  't',
  'setLang',
  'getLang',
  'getLangs',
  'getLangLoadState',
  'subscribe',
] as const;

export const VUE_AUTO_IMPORTS = [
  'useI18n',
  ...RUNTIME_AUTO_IMPORTS,
  'tRef',
  'i18nComputed',
  'tComputed',
] as const;

export const REACT_AUTO_IMPORTS = ['useI18n', ...RUNTIME_AUTO_IMPORTS] as const;

export const ALL_AUTO_IMPORT_APIS = [...VUE_AUTO_IMPORTS] as const;

export type AutoImportApi = (typeof ALL_AUTO_IMPORT_APIS)[number];
