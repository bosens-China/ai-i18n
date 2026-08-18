import type { LangOption } from '@ai-i18n/core';
import type { TranslationAutoImports } from '@ai-i18n/analyzer';
import type { AnalysisLanguage, TranslationHookBinding } from './extractor.js';
import type { ExtractResult } from './yuku-analyzer.js';

export interface NormalizedAiI18nOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
  persist?: { key: string };
  loading?: {
    preload: readonly string[];
    prefetch: readonly string[];
  };
}

export interface ProjectUpdate {
  moduleId: string;
  result: ExtractResult;
  affectedModuleIds: string[];
}

export interface ProjectStateUpdateOptions {
  sourceCode?: string;
  analysisLang?: AnalysisLanguage;
  mapLocation?: (
    location: import('./extractor.js').SourceLocation,
  ) => import('./extractor.js').SourceLocation;
  translationHooks?: readonly TranslationHookBinding[];
  autoImportRuntime?: TranslationAutoImports;
  force?: boolean;
}
