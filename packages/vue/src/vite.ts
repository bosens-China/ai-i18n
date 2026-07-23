import { analyzeVueSource } from '@ai-i18n/vite/analyzer';
import { compileScript, parse } from '@vue/compiler-sfc';
import type { SourceExtraction, SourceExtractor } from '@ai-i18n/vite';

export interface VueExtractor extends SourceExtractor {
  readonly kind: 'vue';
}

export function vue(): VueExtractor {
  return {
    kind: 'vue',
    translationHooks: [
      { module: '@ai-i18n/vue', hook: 'useI18n', property: 't' },
    ],
    test: (id) => !id.startsWith('\0') && id.endsWith('.vue'),
    extract: extractVue,
  };
}

function extractVue(source: string, id: string): SourceExtraction {
  const analysis = analyzeVueSource(source, id, { parse, compileScript });
  return {
    analysisCode: analysis.code,
    analysisLang: analysis.lang,
    mapLocation: analysis.mapLocation,
    registration: analysis.registration,
  };
}
