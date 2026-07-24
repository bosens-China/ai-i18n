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
  CacheFileV1,
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
  ModuleMessages,
} from './runtime.js';
export type {
  TranslationRequest,
  TranslationResult,
  Translator,
} from './provider.js';
