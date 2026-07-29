import type { Plugin } from 'vite';
import {
  extractFrameworkSource,
  frameworkAutoImports,
  resolveFramework,
  type AiI18nFramework,
} from './framework.js';
import type { AiI18nOptions } from './options.js';
import { normalizeOptions, shouldIgnoreSource } from './plugin-utils.js';
import {
  assertDirectDefineI18nMessagesCalls,
  sourceRegistration,
  transformDefineI18nMessages,
} from './source-registration.js';
import { runtimeCode } from './virtual-modules.js';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  analyzeModule,
  findDefineI18nMessagesCalls,
  findUnboundCalls,
} from './yuku-analyzer.js';

const TEST_RUNTIME_ID = '\0virtual:ai-i18n:vitest';
const SOURCE_RE = /\.(?:[cm]?[jt]sx?|vue)(?:\?.*)?$/;

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
      return runtimeCode(
        normalized,
        'ai-i18n:vitest-translation-update',
        'ai-i18n:vitest-locale-update',
        framework,
      );
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
      if (!options.autoImport) {
        return transformDefineI18nMessages(code, id, calls);
      }
      const supported = frameworkAutoImports(framework);
      const unbound = new Set(findUnboundCalls(module, new Set(supported)));
      const autoImports = supported.filter((name) => unbound.has(name));
      if (!autoImports.length && !calls.length) return null;
      return sourceRegistration({
        code,
        id,
        moduleId: '',
        registerPrefix: '',
        module,
        ...(extraction?.registration
          ? { registration: extraction.registration }
          : {}),
        autoImports,
        needsRegistration: false,
        macroCalls: calls,
      });
    },
  };
}
