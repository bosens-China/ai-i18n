export {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  analyzeModule,
  extractMessages,
} from './yuku-analyzer.js';
export type {
  ExtractResult,
  ExtractWarning,
  ExtractedMessage,
} from './yuku-analyzer.js';
export { aiI18n, type AiI18nPluginOptions } from './config-plugin.js';
export {
  defineConfig,
  type AiI18nConfig,
  type AiI18nConfigExport,
} from './config.js';
export type {
  AiI18nCleanupOptions,
  AiI18nDiagnosticsOptions,
  AiI18nPerformanceDiagnosticsOptions,
  AiI18nTranslationMemoryCapacityOptions,
  AiI18nLocaleLoadingOptions,
  AiI18nOptions,
  AiI18nPersistOptions,
  AiI18nProviderOptions,
  AiI18nTimingDiagnosticsOptions,
  AiI18nTranslationMemoryOptions,
} from './options.js';
export type { AiI18nFramework } from './framework.js';
export type { HtmlExtractorOptions } from './html.js';
export type {
  I18nRuntime,
  LangLoadState,
  LangOption,
  MessageTree,
  MessageTreeValue,
  TranslatedMessageTree,
  TranslationBatch,
  TranslationBatchEvent,
  TranslationBatchStage,
  TranslationLogging,
  TranslationMessage,
  TranslationOptions,
  TranslationResult,
  Translator,
} from '@ai-i18n/core';
