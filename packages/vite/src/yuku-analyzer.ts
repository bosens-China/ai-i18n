export {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  analyzeModule,
  extractMessages,
  findDefineI18nMessagesCalls,
  findInvalidDefineI18nMessagesReferences,
  findRuntimeImportDeclarations,
  findUnboundCalls,
  findUnboundReferences,
} from '@ai-i18n/analyzer';
export type {
  DefineI18nMessagesCall,
  ExtractResult,
  ExtractWarning,
  ExtractWarningCode,
  ExtractedMessage,
  Module,
  RuntimeImportDeclaration,
} from '@ai-i18n/analyzer';
