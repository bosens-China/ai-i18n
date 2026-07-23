import type { AnalysisLanguage, SourceLocation } from '@ai-i18n/analyzer';

export type {
  AnalysisLanguage,
  SourceLocation,
  TranslationHookBinding,
} from '@ai-i18n/analyzer';

export interface RegistrationInsertion {
  offset: number;
  prefix?: string;
  suffix?: string;
}

export interface SourceExtraction {
  analysisCode: string;
  analysisLang?: AnalysisLanguage;
  mapLocation(location: SourceLocation): SourceLocation;
  registration?: RegistrationInsertion;
}
