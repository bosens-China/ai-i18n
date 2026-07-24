import type { NormalizedHotChannel, Plugin, ResolvedConfig } from 'vite';
import { createBuildWatchState } from './build-watch.js';
import { createDevUpdateSender } from './dev-updates.js';
import { FileStore } from './file-store.js';
import {
  extractFrameworkSource,
  frameworkAutoImports,
  frameworkTranslationHooks,
  resolveAutoImport,
  resolveFramework,
  writeFrameworkTypes,
  type AiI18nFramework,
} from './framework.js';
import { html as createHtmlExtractor, type HtmlExtractor } from './html.js';
import { createHtmlTransformHandler } from './html-transform.js';
import { createHotUpdateHandler } from './hot-update.js';
import {
  injectBuiltLocaleHints,
  localeFromRequest,
  RESOLVED_LOCALE_PREFIX,
  resolvedLocaleRequestId,
} from './locale-loading.js';
import { loadLocaleModule, renderLocaleChunk } from './locale-module-loader.js';
import { ProjectState } from './project-state.js';
import { ProviderCoordinator } from './provider-coordinator.js';
import { loadRegistration } from './registration-loader.js';
import type { AiI18nOptions } from './options.js';
import {
  normalizeOptions,
  normalizeRoot,
  shouldIgnoreSource,
  sourceUpdateOptions,
} from './plugin-utils.js';
import { runtimeCode, runtimeStubCode } from './virtual-modules.js';
import { sourceRegistration } from './source-registration.js';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  findUnboundCalls,
} from './yuku-analyzer.js';

const RESOLVED_RUNTIME_ID = `\0${AI_I18N_VIRTUAL_MODULE_ID}`;
const REGISTER_PREFIX = `${AI_I18N_VIRTUAL_MODULE_ID}/register?module=`;
const RESOLVED_REGISTER_PREFIX = `\0${REGISTER_PREFIX}`;
const SOURCE_RE = /\.(?:[cm]?[jt]sx?|vue)(?:\?.*)?$/;
const VIRTUAL_RE =
  /^(?:virtual:ai-i18n(?:\/register\?module=.+|\/locale\/[^?]+)?|.*\/@ai-i18n\/locale\/[^?]+\.js(?:\?.*)?)$/;
const RESOLVED_VIRTUAL_RE =
  /^\0virtual:ai-i18n(?:\/register\?module=.+|\/locale\/[^?]+)?$/;
const TRANSLATION_UPDATE_EVENT = 'ai-i18n:update';
const LOCALE_UPDATE_EVENT = 'ai-i18n:locale-update';

export function aiI18n(options: AiI18nOptions): Plugin {
  const normalized = normalizeOptions(options);
  const htmlExtractor: HtmlExtractor | undefined = options.html
    ? createHtmlExtractor(options.html === true ? {} : options.html)
    : undefined;
  let autoImport = options.autoImport ?? false;
  let framework: AiI18nFramework = options.framework ?? 'vanilla';
  let translationHooks = frameworkTranslationHooks(framework, autoImport);
  let config: ResolvedConfig | undefined;
  let state: ProjectState | undefined;
  let store: FileStore | undefined;
  let ready: Promise<void> = Promise.resolve();
  let coordinator: ProviderCoordinator | undefined;
  let devHot: NormalizedHotChannel | undefined;
  let warnedSsr = false;

  function currentState() {
    if (!state) throw new Error('[ai-i18n] plugin used before configResolved');
    return state;
  }

  function currentStore() {
    if (!store)
      throw new Error('[ai-i18n] file store used before configResolved');
    return store;
  }

  const {
    sendTranslationUpdates,
    sendLocaleUpdates,
    requestMissingTranslations,
  } = createDevUpdateSender({
    options: normalized,
    state: currentState,
    hot: () => devHot,
    coordinator: () => coordinator,
    translationEvent: TRANSLATION_UPDATE_EVENT,
    localeEvent: LOCALE_UPDATE_EVENT,
  });

  const buildWatch = createBuildWatchState({
    sourcePattern: SOURCE_RE,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    requestMissingTranslations,
  });

  const handleHotUpdate = createHotUpdateHandler({
    sourcePattern: SOURCE_RE,
    resolvedRegisterPrefix: RESOLVED_REGISTER_PREFIX,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    framework: () => framework,
    autoImport: () => autoImport,
    translationHooks: () => translationHooks,
    localeLoading: normalized.loading !== undefined,
    sendTranslationUpdates,
    sendLocaleUpdates,
    requestMissingTranslations,
  });

  const transformIndexHtml = createHtmlTransformHandler({
    ...(htmlExtractor ? { extractor: htmlExtractor } : {}),
    options: normalized,
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    requestMissingTranslations,
    flush: () => coordinator?.flush() ?? Promise.resolve(),
    setDevHot(hot) {
      devHot = hot;
    },
  });

  return {
    name: 'ai-i18n',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved;
      framework = resolveFramework(resolved.plugins, options.framework);
      autoImport = resolveAutoImport(resolved.plugins, options.autoImport);
      translationHooks = frameworkTranslationHooks(framework, autoImport);
      state = new ProjectState(normalizeRoot(resolved.root), normalized);
      store = new FileStore({
        root: normalizeRoot(resolved.root),
        sourceLang: normalized.sourceLang,
        locales: normalized.locales,
        ...(options.directory ? { directory: options.directory } : {}),
        cleanupMissingSourceFiles: options.cleanup?.missingSourceFiles ?? true,
        cleanupOrphanMessages: options.cleanup?.orphanMessages ?? false,
        ...(options.cache ? { cache: options.cache } : {}),
        onWarning: (message) => resolved.logger.warn(`[ai-i18n] ${message}`),
      });
      ready = Promise.all([
        store.load(),
        writeFrameworkTypes(resolved.root, framework, autoImport, options.dts),
      ]).then(([cache]) => {
        currentState().hydrateCache(cache);
      });
      if (options.translator) {
        coordinator = new ProviderCoordinator(options.translator, {
          ...options.provider,
          async onResults(results) {
            const project = currentState();
            const affected = project.applyTranslations(results);
            const cache = await currentStore().sync(project.snapshot());
            project.hydrateCache(cache);
            if (normalized.loading) {
              if (affected.length) {
                sendLocaleUpdates(results.map((result) => result.locale));
              }
            } else {
              sendTranslationUpdates(affected);
            }
          },
          onWarning(message) {
            const warning = `[ai-i18n] ${message}`;
            if (resolved.logger) resolved.logger.warn(warning);
            else console.warn(warning);
          },
        });
      }
    },

    async buildStart() {
      if (config?.command === 'build') {
        await buildWatch.buildStart(this.meta.watchMode);
      }
    },

    async watchChange(id, change) {
      if (config?.command === 'build' && this.meta.watchMode) {
        await buildWatch.watchChange(id, change.event);
      }
    },

    resolveId: {
      filter: { id: VIRTUAL_RE },
      handler(id) {
        if (id === AI_I18N_VIRTUAL_MODULE_ID) return RESOLVED_RUNTIME_ID;
        if (id.startsWith(REGISTER_PREFIX)) return `\0${id}`;
        const locale = localeFromRequest(id);
        if (
          locale &&
          normalized.locales.some(
            (option) =>
              option.value === locale && locale !== normalized.sourceLang,
          )
        ) {
          return resolvedLocaleRequestId(id, locale);
        }
      },
    },

    load: {
      filter: { id: RESOLVED_VIRTUAL_RE },
      async handler(id, loadOptions) {
        if (loadOptions?.ssr || this.environment.name !== 'client') {
          if (!warnedSsr) {
            warnedSsr = true;
            this.warn(
              '[ai-i18n] SSR runtime is not supported; injection skipped.',
            );
          }
          if (id === RESOLVED_RUNTIME_ID) return runtimeStubCode(framework);
          return id.startsWith(RESOLVED_LOCALE_PREFIX)
            ? 'export default {};'
            : 'export {};';
        }
        if (id === RESOLVED_RUNTIME_ID) {
          return runtimeCode(
            normalized,
            TRANSLATION_UPDATE_EVENT,
            LOCALE_UPDATE_EVENT,
            framework,
            config?.command === 'build',
            config?.base,
          );
        }
        await ready;
        const localeModule = await loadLocaleModule(this, {
          id,
          build: config?.command === 'build',
          project: currentState(),
          store: currentStore(),
          flush: () => coordinator?.flush() ?? Promise.resolve(),
          reconcile: (moduleIds) => buildWatch.reconcile(moduleIds),
        });
        if (localeModule !== undefined) return localeModule;
        const moduleId = decodeRegisterId(id);
        return loadRegistration(this, {
          moduleId,
          build: config?.command === 'build',
          project: currentState(),
          store: currentStore(),
          flush: () => coordinator?.flush() ?? Promise.resolve(),
          ...(normalized.loading ? { locale: normalized.sourceLang } : {}),
        });
      },
    },

    transform: {
      filter: { id: SOURCE_RE },
      async handler(code, id, transformOptions) {
        if (shouldIgnoreSource(id)) return null;
        const extraction = await extractFrameworkSource(code, id, framework);
        if (extraction === null) return null;
        if (transformOptions?.ssr || this.environment.name !== 'client') {
          if (!warnedSsr) {
            warnedSsr = true;
            this.warn('[ai-i18n] SSR transform skipped; browser runtime only.');
          }
          return null;
        }
        if (config?.command === 'serve' && 'hot' in this.environment) {
          devHot = this.environment.hot as NormalizedHotChannel;
        }
        await ready;

        const project = currentState();
        let update = project.update(
          extraction?.analysisCode ?? code,
          id,
          sourceUpdateOptions(
            extraction,
            code,
            translationHooks,
            autoImport && framework === 'vanilla',
          ),
        );
        if (!update) return null;
        const { moduleId } = update;
        let analysisChanged = false;
        const analyzed = project.analyzer.module(moduleId);
        if (analyzed) {
          for (const imported of analyzed.imports) {
            const resolved = await this.resolve(imported.specifier, id, {
              skipSelf: true,
            });
            if (
              resolved &&
              !resolved.external &&
              !resolved.id.startsWith('\0')
            ) {
              this.addWatchFile(resolved.id);
              analysisChanged =
                project.setResolution(id, imported.specifier, resolved.id) ||
                analysisChanged;
              const targetId = project.normalizeId(resolved.id);
              if (
                update.result.pending &&
                targetId &&
                !project.analyzer.module(targetId)
              ) {
                await this.load({ id: resolved.id });
                analysisChanged = true;
              }
            }
          }
        }
        if (analysisChanged) {
          update = project.update(extraction?.analysisCode ?? code, id, {
            ...sourceUpdateOptions(
              extraction,
              code,
              translationHooks,
              autoImport && framework === 'vanilla',
            ),
            force: true,
          })!;
        }
        const { result } = update;
        for (const warning of result.warnings) {
          this.warn({
            message: warning.message,
            id,
            loc: { line: warning.line, column: warning.column },
          });
        }
        const cache = await currentStore().sync(project.snapshot());
        project.hydrateCache(cache);
        requestMissingTranslations(update.affectedModuleIds);
        const currentModule = project.analyzer.module(moduleId)!;
        // 只注入没有本地 symbol 的调用，避免覆盖用户自己的同名函数。
        const unboundCalls = autoImport
          ? new Set(
              findUnboundCalls(
                currentModule,
                new Set(frameworkAutoImports(framework)),
              ),
            )
          : new Set<string>();
        const autoImports = frameworkAutoImports(framework).filter((name) =>
          unboundCalls.has(name),
        );
        const needsRegistration = Boolean(
          result.messages.length || result.pending,
        );
        if (!needsRegistration && !autoImports.length) return null;

        return sourceRegistration({
          code,
          id,
          moduleId,
          registerPrefix: REGISTER_PREFIX,
          module: currentModule,
          ...(extraction?.registration
            ? { registration: extraction.registration }
            : {}),
          autoImports,
          needsRegistration,
        });
      },
    },

    async renderChunk(code, chunk) {
      return renderLocaleChunk(this, code, chunk.facadeModuleId, {
        project: currentState(),
        store: currentStore(),
        flush: () => coordinator?.flush() ?? Promise.resolve(),
        reconcile: (moduleIds) => buildWatch.reconcile(moduleIds),
      });
    },

    transformIndexHtml: { order: 'pre', handler: transformIndexHtml },

    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        if (config?.command !== 'build') return;
        if (this.meta.watchMode) {
          await buildWatch.reconcile(this.getModuleIds());
        }
        injectBuiltLocaleHints(bundle, config, normalized);
      },
    },

    hotUpdate: handleHotUpdate,
  };
}

function decodeRegisterId(id: string) {
  return decodeURIComponent(id.slice(RESOLVED_REGISTER_PREFIX.length));
}
