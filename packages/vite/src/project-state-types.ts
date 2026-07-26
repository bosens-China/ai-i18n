import type { LangOption, MissingTranslationFallback } from '@ai-i18n/core';
import type { ExtractResult } from './yuku-analyzer.js';

export interface NormalizedAiI18nOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
  persist?: { key: string };
  detect?: 'navigator';
  fallback?: MissingTranslationFallback;
  loading?: {
    strategy: 'locale';
    preload: readonly string[];
    prefetch: readonly string[];
  };
}

export interface ProjectUpdate {
  moduleId: string;
  result: ExtractResult;
  affectedModuleIds: string[];
}
