export interface SourceLocation {
  line: number;
  column: number;
}

export interface RegistrationInsertion {
  offset: number;
  prefix?: string;
  suffix?: string;
}

/** 描述框架 Hook 返回值中承载翻译函数的属性，由共享 Yuku AST 统一识别。 */
export interface TranslationHookBinding {
  module: string;
  hook: string;
  property: string;
}

export interface SourceExtraction {
  analysisCode: string;
  mapLocation(location: SourceLocation): SourceLocation;
  registration?: RegistrationInsertion;
  translationHooks?: readonly TranslationHookBinding[];
}

export interface SourceExtractor {
  readonly kind: string;
  test(id: string): boolean;
  extract(code: string, id: string): SourceExtraction;
}
