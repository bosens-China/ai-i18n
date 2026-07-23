import type {
  AnalysisLanguage,
  SourceLocation,
  TranslationHookBinding,
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
  mapLocation(location: SourceLocation): SourceLocation;
  registration?: RegistrationInsertion;
  translationHooks?: readonly TranslationHookBinding[];
}

export interface SourceExtractor {
  readonly kind: string;
  /** 框架 Hook 语义独立于文件预处理，普通 .js/.ts 也必须能够识别。 */
  readonly translationHooks?: readonly TranslationHookBinding[];
  test(id: string): boolean;
  extract(code: string, id: string): SourceExtraction;
}
