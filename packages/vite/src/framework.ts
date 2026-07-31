import {
  diagnosticMessage,
  type TranslationRuntimeApi,
} from '@ai-i18n/analyzer';
import { analyzeVueSource } from '@ai-i18n/analyzer/vue';
import type { Plugin } from 'vite';
import type { SourceExtraction, TranslationHookBinding } from './extractor.js';
import { FRAMEWORK_AUTO_IMPORTS } from './framework-dts.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

export type AiI18nFramework = 'vanilla' | 'vue' | 'react';
export { writeFrameworkTypes } from './framework-dts.js';

export const SOURCE_RE = /\.(?:js|mjs|ts|mts|jsx|tsx|vue)(?:\?.*)?$/;
const PLAIN_SOURCE_RE = /\.(?:js|mjs|ts|mts)$/;
const JSX_SOURCE_RE = /\.[jt]sx$/;
const TRANSLATION_AUTO_IMPORTS = {
  vanilla: new Set<TranslationRuntimeApi>(['t']),
  vue: new Set<TranslationRuntimeApi>(['t', 'tRef', 'tComputed']),
  react: new Set<TranslationRuntimeApi>(['t']),
} satisfies Record<AiI18nFramework, ReadonlySet<TranslationRuntimeApi>>;

export function resolveFramework(
  plugins: readonly Plugin[],
  configured?: AiI18nFramework,
): AiI18nFramework {
  // configResolved 提供最终插件名，避免要求用户重复声明宿主框架。
  const names = plugins.map((plugin) => plugin.name);
  const hasVue = names.some(
    (name) => name === 'vite:vue' || name === 'vite:vue-jsx',
  );
  const hasReact = names.some((name) => name.startsWith('vite:react'));

  if (hasVue && hasReact) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 同一次构建不能同时使用 Vue 和 React 的 Vite 插件。',
        '[ai-i18n] Vue and React Vite plugins cannot be used in the same build.',
      ),
    );
  }

  const detected: AiI18nFramework = hasVue
    ? 'vue'
    : hasReact
      ? 'react'
      : 'vanilla';
  return configured ?? detected;
}

export function frameworkAutoImports(
  framework: AiI18nFramework,
): readonly string[] {
  return FRAMEWORK_AUTO_IMPORTS[framework];
}

export function frameworkTranslationAutoImports(
  framework: AiI18nFramework,
): ReadonlySet<TranslationRuntimeApi> {
  return TRANSLATION_AUTO_IMPORTS[framework];
}

export function frameworkTranslationHooks(
  framework: AiI18nFramework,
  autoImport: boolean,
): readonly TranslationHookBinding[] {
  return framework === 'vanilla'
    ? []
    : [
        {
          module: AI_I18N_VIRTUAL_MODULE_ID,
          hook: 'useI18n',
          property: 't',
          autoImport,
        },
      ];
}

export async function extractFrameworkSource(
  source: string,
  id: string,
  framework: AiI18nFramework,
): Promise<SourceExtraction | null | undefined> {
  const filename = id.split('?')[0]!;
  if (!supportsSource(filename, framework)) return null;
  if (!filename.endsWith('.vue')) return undefined;

  // Vue 的 Node 入口会注册宿主 TypeScript，支持解析宏中引用的外部类型。
  const { compileScript, compileTemplate, parse } =
    await import('vue/compiler-sfc');
  const analysis = analyzeVueSource(source, id, {
    parse,
    compileScript,
    compileTemplate,
  });
  return {
    analysisCode: analysis.code,
    analysisLang: analysis.lang,
    autoImportCode: analysis.autoImportCode,
    autoImportLang: analysis.autoImportLang,
    mapLocation: analysis.mapLocation,
    registration: analysis.registration,
    templateRegistration: analysis.templateRegistration,
    macroCalls: analysis.macroCalls,
    templateAutoImportCandidates: analysis.templateAutoImportCandidates,
    templateImports: analysis.templateImports,
  };
}

function supportsSource(filename: string, framework: AiI18nFramework): boolean {
  if (PLAIN_SOURCE_RE.test(filename)) return true;
  if (framework === 'vanilla') return false;
  if (JSX_SOURCE_RE.test(filename)) return true;
  return framework === 'vue' && filename.endsWith('.vue');
}
