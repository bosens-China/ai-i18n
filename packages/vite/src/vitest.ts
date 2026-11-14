import type { Plugin } from 'vite';
import {
  extractFrameworkSource,
  frameworkAutoImports,
  resolveFramework,
  SOURCE_RE,
  type AiI18nFramework,
} from './framework.js';
import type { AiI18nOptions } from './options.js';
import { normalizeOptions, shouldIgnoreSource } from './plugin-utils.js';
import {
  assertDirectDefineI18nMessagesCalls,
  sourceRegistration,
  transformDefineI18nMessages,
} from './source-registration.js';
import type { NormalizedAiI18nOptions } from './project-state.js';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  analyzeModule,
  findDefineI18nMessagesCalls,
  findUnboundReferences,
} from './yuku-analyzer.js';

const TEST_RUNTIME_ID = '\0virtual:ai-i18n:vitest';

export type AiI18nVitestOptions = Pick<
  AiI18nOptions,
  | 'sourceLang'
  | 'defaultLang'
  | 'locales'
  | 'framework'
  | 'persist'
  | 'autoImport'
>;

export function aiI18nVitest(options: AiI18nVitestOptions): Plugin {
  const normalized = normalizeOptions(options);
  let framework: AiI18nFramework = options.framework ?? 'vanilla';

  return {
    name: 'ai-i18n:vitest',
    enforce: 'pre',
    configResolved(config) {
      framework = resolveFramework(config.plugins, options.framework);
    },
    resolveId(id) {
      if (id === AI_I18N_VIRTUAL_MODULE_ID) return TEST_RUNTIME_ID;
    },
    load(id) {
      if (id !== TEST_RUNTIME_ID) return;
      return vitestRuntimeCode(normalized, framework);
    },
    async transform(code, id) {
      if (!SOURCE_RE.test(id) || shouldIgnoreSource(id)) return null;
      const extraction = await extractFrameworkSource(code, id, framework);
      if (extraction === null) return null;
      const module = analyzeModule(
        extraction?.analysisCode ?? code,
        id.split('?')[0] ?? id,
        undefined,
        extraction?.analysisLang,
      );
      assertDirectDefineI18nMessagesCalls(module);
      const calls =
        extraction?.macroCalls ?? findDefineI18nMessagesCalls(module);
      const supported = frameworkAutoImports(framework);
      const autoImportModule =
        extraction?.autoImportCode === undefined
          ? module
          : analyzeModule(
              extraction.autoImportCode,
              `${id.split('?')[0] ?? id}?auto-import`,
              undefined,
              extraction.autoImportLang,
            );
      const unbound = options.autoImport
        ? new Set(findUnboundReferences(autoImportModule, new Set(supported)))
        : new Set<string>();
      const autoImports = options.autoImport
        ? supported.filter((name) => unbound.has(name))
        : [];
      const templateImports = [
        ...(extraction?.templateImports ?? []),
        ...(options.autoImport
          ? (extraction?.templateAutoImportCandidates ?? [])
          : []),
      ];
      if (!options.autoImport && !templateImports.length) {
        return transformDefineI18nMessages(code, id, calls);
      }
      if (!autoImports.length && !templateImports.length && !calls.length) {
        return null;
      }
      return sourceRegistration({
        code,
        id,
        moduleId: '',
        registerPrefix: '',
        module,
        ...(extraction?.registration
          ? { registration: extraction.registration }
          : {}),
        ...(extraction?.templateRegistration
          ? { templateRegistration: extraction.templateRegistration }
          : {}),
        autoImports,
        templateImports,
        needsRegistration: false,
        dev: false,
        macroCalls: calls,
      });
    },
  };
}

function vitestRuntimeCode(
  options: NormalizedAiI18nOptions,
  framework: AiI18nFramework,
): string {
  const adapter =
    framework === 'vue'
      ? `import { createVueI18nAdapter } from '@ai-i18n/vite/vue';`
      : framework === 'react'
        ? `import { createReactI18n } from '@ai-i18n/vite/react';`
        : '';
  const publicApi =
    framework === 'vue'
      ? `export const { t, useI18n, tRef, i18nComputed, tComputed } = createVueI18nAdapter(runtime);`
      : framework === 'react'
        ? `export const t = runtime.t;
export const useI18n = createReactI18n(runtime);`
        : `export const t = runtime.t;`;
  return `
import { createI18nRuntime } from '@ai-i18n/vite/runtime';
${adapter}
const runtime = createI18nRuntime(${JSON.stringify(options)});
${publicApi}
export const setLang = runtime.setLang;
export const getLang = runtime.getLang;
export const getLangs = runtime.getLangs;
export const getLangLoadState = runtime.getLangLoadState;
export const subscribe = runtime.subscribe;
`;
}
