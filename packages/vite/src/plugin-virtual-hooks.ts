import type { Plugin, ResolvedConfig } from 'vite';
import type { NormalizedAiI18nOptions } from './project-state.js';
import type { ProjectState } from './project-state.js';
import type { FileStore } from './file-store.js';
import type { AiI18nFramework } from './framework.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import {
  localeFromRequest,
  RESOLVED_LOCALE_PREFIX,
  resolvedLocaleRequestId,
} from './locale-loading.js';
import { loadLocaleModule } from './locale-module-loader.js';
import { loadRegistration } from './registration-loader.js';
import { normalizeProjectId } from './project-paths.js';
import { ssrWarningMessage } from './ssr-warning.js';
import {
  runtimeCode,
  runtimeStubCode,
  scopedRuntimeCode,
} from './virtual-modules.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

const RESOLVED_RUNTIME_ID = `\0${AI_I18N_VIRTUAL_MODULE_ID}`;
const RESOLVED_SCOPED_RUNTIME_PREFIX = `${RESOLVED_RUNTIME_ID}?module=`;
const INTERNAL_RUNTIME_ID = `${AI_I18N_VIRTUAL_MODULE_ID}/internal`;
export const REGISTER_PREFIX = `${AI_I18N_VIRTUAL_MODULE_ID}/register?module=`;
export const RESOLVED_REGISTER_PREFIX = `\0${REGISTER_PREFIX}`;
const VIRTUAL_RE =
  /^(?:virtual:ai-i18n(?:\/internal|\/register\?module=.+|\/locale\/[^?]+)?|.*\/@ai-i18n\/locale\/[^?]+\.js(?:\?.*)?)$/;
const RESOLVED_VIRTUAL_RE =
  /^\0virtual:ai-i18n(?:\?module=.+|\/register\?module=.+|\/locale\/[^?]+)?$/;

interface CreateVirtualModuleHooksOptions {
  normalized: NormalizedAiI18nOptions;
  config(): ResolvedConfig | undefined;
  framework(): AiI18nFramework;
  ready(): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  flushProvider(): Promise<void>;
  reconcile(moduleIds: Iterable<string>, complete?: boolean): Promise<void>;
  runStateTask: DevStateTaskRunner;
  warnSsrOnce(warn: () => void): void;
  translationUpdateEvent: string;
  localeUpdateEvent: string;
}

export function createVirtualModuleHooks(
  options: CreateVirtualModuleHooksOptions,
): Pick<Plugin, 'resolveId' | 'load'> {
  return {
    resolveId: {
      filter: { id: VIRTUAL_RE },
      handler(id, importer, resolveOptions) {
        if (id === INTERNAL_RUNTIME_ID) return RESOLVED_RUNTIME_ID;
        if (id === AI_I18N_VIRTUAL_MODULE_ID) {
          const config = options.config();
          if (
            !resolveOptions?.ssr &&
            importer &&
            !importer.startsWith('\0') &&
            config
          ) {
            const moduleId = normalizeProjectId(config.root, importer);
            if (moduleId) {
              return `${RESOLVED_SCOPED_RUNTIME_PREFIX}${encodeURIComponent(moduleId)}`;
            }
          }
          return RESOLVED_RUNTIME_ID;
        }
        if (id.startsWith(REGISTER_PREFIX)) return `\0${id}`;
        const locale = localeFromRequest(id);
        if (
          locale &&
          options.normalized.locales.some(
            (candidate) =>
              candidate.value === locale &&
              locale !== options.normalized.sourceLang,
          )
        ) {
          return resolvedLocaleRequestId(id, locale);
        }
      },
    },

    load: {
      filter: { id: RESOLVED_VIRTUAL_RE },
      async handler(id, loadOptions) {
        const config = options.config();
        const framework = options.framework();
        if (loadOptions?.ssr || this.environment.name !== 'client') {
          options.warnSsrOnce(() => this.warn(ssrWarningMessage('injection')));
          if (id === RESOLVED_RUNTIME_ID) return runtimeStubCode(framework);
          return id.startsWith(RESOLVED_LOCALE_PREFIX)
            ? 'export default {};'
            : 'export {};';
        }
        if (id === RESOLVED_RUNTIME_ID) {
          return runtimeCode(
            options.normalized,
            options.translationUpdateEvent,
            options.localeUpdateEvent,
            framework,
            config?.command === 'build',
            config?.base,
          );
        }
        if (id.startsWith(RESOLVED_SCOPED_RUNTIME_PREFIX)) {
          return scopedRuntimeCode(
            decodeURIComponent(id.slice(RESOLVED_SCOPED_RUNTIME_PREFIX.length)),
            framework,
          );
        }
        await options.ready();
        const localeModule = await loadLocaleModule(this, {
          id,
          build: config?.command === 'build',
          project: options.state(),
          store: options.store(),
          flush: options.flushProvider,
          reconcile: options.reconcile,
          runStateTask: options.runStateTask,
        });
        if (localeModule !== undefined) return localeModule;
        const moduleId = decodeURIComponent(
          id.slice(RESOLVED_REGISTER_PREFIX.length),
        );
        return loadRegistration(this, {
          moduleId,
          build: config?.command === 'build',
          project: options.state(),
          store: options.store(),
          flush: options.flushProvider,
          ...(options.normalized.loading
            ? { locale: options.normalized.sourceLang }
            : {}),
          runStateTask: options.runStateTask,
        });
      },
    },
  };
}
