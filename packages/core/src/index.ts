export {
  createMessageId,
  normalizeComment,
  translationComment,
} from './message-id.js';
export type { TranslationOptions } from './message-id.js';
export {
  AiI18nSchemaError,
  TranslationConflictError,
  parseExtractedFile,
  parseLocaleFile,
  parseTranslationOverridesFile,
  parseTranslationMemoryFile,
} from './schema.js';
export type {
  CacheMessage,
  ExtractedFile,
  ExtractedMessage,
  LangOption,
  LocaleFileV1,
  TranslationMemoryFile,
  TranslationOverrideMessage,
  TranslationOverridesFile,
  TranslationValue,
} from './schema.js';
export { createI18nRuntime } from './runtime.js';
export type {
  I18nRuntime,
  I18nRuntimeOptions,
  LocaleLoader,
  LocaleMessages,
  ModuleMessages,
  Translate,
} from './runtime.js';
export { resolveTranslationOverride } from './translation-override.js';
export {
  createTemplateMessage,
  escapeTemplateLiteral,
  formatTemplateMessage,
  hasSameTemplateTokens,
} from './template.js';
export type {
  TranslationBatch,
  TranslationMessage,
  TranslationResult,
  Translator,
} from './provider.js';
