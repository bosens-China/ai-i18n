export {
  MESSAGE_ID_VERSION,
  createMessageId,
  escapeMessageIdPart,
  normalizeComment,
  parseMessageId,
} from './message-id.js';
export {
  AiI18nSchemaError,
  TranslationConflictError,
  mergeCacheMessages,
  parseCacheFile,
  parseExtractedFile,
  parseLocaleFile,
} from './schema.js';
export type {
  CacheFileV2,
  CacheMessage,
  ExtractedFileV1,
  ExtractedMessage,
  LangOption,
  LocaleFileV1,
  TranslationValue,
} from './schema.js';
export { createI18nRuntime } from './runtime.js';
export type {
  I18nRuntime,
  I18nRuntimeOptions,
  LocaleLoader,
  LocaleMessages,
  MissingTranslationFallback,
  ModuleMessages,
  Translate,
} from './runtime.js';
export {
  createTemplateMessage,
  formatTemplateMessage,
  templatePlaceholderIndexes,
} from './template.js';
export type {
  TranslationRequest,
  TranslationResult,
  Translator,
} from './provider.js';
