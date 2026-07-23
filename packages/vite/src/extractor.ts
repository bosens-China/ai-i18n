import type { AnalysisLanguage, SourceLocation } from '@boses/analyzer';

export type {
  AnalysisLanguage,
  SourceLocation,
  TranslationHookBinding,
} from '@boses/analyzer';

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
