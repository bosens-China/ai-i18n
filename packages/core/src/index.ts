export {
  createMessageId,
  normalizeComment,
  translationComment,
} from './message-id.js';
export type { TranslationOptions } from './message-id.js';
export { translateMessageTree } from './message-tree.js';
export type {
  MessageTree,
  MessageTreeValue,
  TranslatedMessageTree,
} from './message-tree.js';
export {
  atomicOverrideKey,
  atomicOverrides,
  overridesFromAtomic,
} from './override-rules.js';
export type {
  AtomicOverride,
  AtomicOverrideTarget,
  OverrideMessageReference,
} from './override-rules.js';
export type {
  ReviewFilter,
  ReviewLocale,
  ReviewMessage,
  ReviewMessageReference,
  ReviewMutation,
  ReviewOccurrence,
  ReviewOverride,
  ReviewSnapshot,
  ReviewSourceLocation,
} from './review-contracts.js';
export {
  REVIEW_UI_THEME_CHANGE_EVENT,
  REVIEW_UI_THEME_STORAGE_KEY,
  parseReviewUiThemePreference,
  readResolvedReviewUiTheme,
  readReviewUiThemePreference,
  resolveReviewUiTheme,
  saveReviewUiThemePreference,
} from './review-ui-theme.js';
export type {
  ReviewUiTheme,
  ReviewUiThemePreference,
} from './review-ui-theme.js';
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
  TranslationOverrideRule,
  TranslationOverrideOccurrence,
  TranslationOverridesFile,
  TranslationValue,
} from './schema.js';
export {
  createI18nRuntime,
  createScopedTranslate,
  runtimeMessageId,
} from './runtime.js';
export type {
  I18nRuntime,
  I18nRuntimeOptions,
  LangLoadState,
  LocaleLoader,
  LocaleMessages,
  ModuleMessages,
} from './runtime.js';
export type { Translate } from './translate.js';
export {
  resolveTranslationOverride,
  translationOccurrenceKey,
} from './translation-override.js';
export type { TranslationOccurrence } from './translation-override.js';
export {
  createTemplateMessage,
  escapeTemplateLiteral,
  formatTemplateMessage,
  hasSameTemplateTokens,
  templateTokens,
} from './template.js';
export type {
  TranslationBatch,
  TranslationBatchEvent,
  TranslationBatchStage,
  TranslationLogging,
  TranslationMessage,
  TranslationResult,
  Translator,
} from './provider.js';
