import type { Plugin } from 'vite';
import { resolveFramework, type AiI18nFramework } from './framework.js';
import type { AiI18nOptions } from './options.js';
import { normalizeOptions } from './plugin-utils.js';
import { runtimeCode } from './virtual-modules.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

const TEST_RUNTIME_ID = '\0virtual:ai-i18n:vitest';

export type AiI18nVitestOptions = Pick<
  AiI18nOptions,
  | 'sourceLang'
  | 'defaultLang'
  | 'locales'
  | 'framework'
  | 'persist'
  | 'detect'
  | 'fallback'
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
  };
}
