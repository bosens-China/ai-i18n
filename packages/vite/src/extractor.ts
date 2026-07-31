import type {
  AnalysisLanguage,
  DefineI18nMessagesCall,
  SourceLocation,
} from '@ai-i18n/analyzer';

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
  autoImportCode?: string;
  autoImportLang?: AnalysisLanguage;
  mapLocation(location: SourceLocation): SourceLocation;
  registration?: RegistrationInsertion;
  templateRegistration?: RegistrationInsertion;
  macroCalls?: DefineI18nMessagesCall[];
  templateAutoImportCandidates?: readonly string[];
  templateImports?: readonly string[];
}
