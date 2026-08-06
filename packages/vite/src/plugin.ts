import {
  type NormalizedHotChannel,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { createBuildWatchState } from './build-watch.js';
import { createDevUpdateSender } from './dev-updates.js';
import {
  createDevStateQueue,
  type DevStateTaskRunner,
} from './dev-state-queue.js';
import { FileStore } from './file-store.js';
import {
  frameworkTranslationHooks,
  resolveFramework,
  SOURCE_RE,
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
import { resolveProviderLogging } from './provider-logging.js';
import { loadRegistration } from './registration-loader.js';
import type { AiI18nOptions } from './options.js';
import {
  normalizeOptions,
  normalizeProviderCache,
  normalizeRoot,
  normalizeTranslationMemory,
} from './plugin-utils.js';
import { createSourceTransformHandler } from './source-transform.js';
import { ssrWarningMessage } from './ssr-warning.js';
import { runtimeCode, runtimeStubCode } from './virtual-modules.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

const RESOLVED_RUNTIME_ID = `\0${AI_I18N_VIRTUAL_MODULE_ID}`;
const REGISTER_PREFIX = `${AI_I18N_VIRTUAL_MODULE_ID}/register?module=`;
const RESOLVED_REGISTER_PREFIX = `\0${REGISTER_PREFIX}`;
const VIRTUAL_RE =
  /^(?:virtual:ai-i18n(?:\/register\?module=.+|\/locale\/[^?]+)?|.*\/@ai-i18n\/locale\/[^?]+\.js(?:\?.*)?)$/;
const RESOLVED_VIRTUAL_RE =
  /^\0virtual:ai-i18n(?:\/register\?module=.+|\/locale\/[^?]+)?$/;
const TRANSLATION_UPDATE_EVENT = 'ai-i18n:update';
const LOCALE_UPDATE_EVENT = 'ai-i18n:locale-update';

export function aiI18n(options: AiI18nOptions): Plugin {
  const normalized = normalizeOptions(options);
  const translationMemory = normalizeTranslationMemory(
    options.translationMemory,
  );
  const providerCache = normalizeProviderCache(options.provider?.cache);
  const htmlExtractor: HtmlExtractor | undefined = options.html
    ? createHtmlExtractor(options.html === true ? {} : options.html)
    : undefined;
  const autoImport = options.autoImport ?? false;
  let framework: AiI18nFramework = options.framework ?? 'vanilla';
  let translationHooks = frameworkTranslationHooks(framework, autoImport);
  let config: ResolvedConfig | undefined;
  let state: ProjectState | undefined;
  let store: FileStore | undefined;
  let ready: Promise<void> = Promise.resolve();
  let coordinator: ProviderCoordinator | undefined;
  let devHot: NormalizedHotChannel | undefined;
  let warnedSsr = false;
  const queueDevStateTask = createDevStateQueue();

  const runStateTask: DevStateTaskRunner = (task) =>
    config?.command === 'build'
      ? Promise.resolve().then(task)
      : queueDevStateTask(task);

  function currentState() {
    if (!state) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 插件在 configResolved 之前被调用。',
          '[ai-i18n] Plugin used before configResolved.',
        ),
      );
    }
    return state;
  }

  function currentStore() {
    if (!store) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 文件存储在 configResolved 之前被调用。',
          '[ai-i18n] File store used before configResolved.',
        ),
      );
    }
    return store;
  }

  const {
    sendTranslationUpdates,
    sendLocaleUpdates,
    requestMissingTranslations,
    dispose: disposeDevUpdates,
  } = createDevUpdateSender({
    options: normalized,
    state: currentState,
    hot: () => devHot,
    coordinator: () => coordinator,
    providerCache,
    reportMissingTranslations(message) {
      if (config?.command === 'serve') config.logger?.info(message);
    },
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
    runStateTask,
  });

  const transformSource = createSourceTransformHandler({
    registerPrefix: REGISTER_PREFIX,
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    framework: () => framework,
    autoImport: () => autoImport,
    translationHooks: () => translationHooks,
    requestMissingTranslations,
    setDevHot(hot) {
      devHot = hot;
    },
    warnSsrOnce(warn) {
      if (warnedSsr) return;
      warnedSsr = true;
      warn();
    },
    runStateTask,
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
    runStateTask,
  });

  return {
    name: 'ai-i18n',
    enforce: 'pre',

    configResolved(resolved) {
      if (
        options.provider &&
        typeof options.provider.translator !== 'function'
      ) {
        throw new TypeError(
          diagnosticMessage(
            '[ai-i18n] provider.translator 必须是函数。',
            '[ai-i18n] provider.translator must be a function.',
          ),
        );
      }
      config = resolved;
      framework = resolveFramework(resolved.plugins, options.framework);
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
        translationMemory,
        onWarning: (message) => resolved.logger.warn(`[ai-i18n] ${message}`),
        onSynced(batchIds) {
          for (const batchId of batchIds) {
            coordinator?.reportBatchEvent({
              batchId,
              stage: 'persisted',
            });
          }
        },
      });
      if (resolved.command === 'build' && resolved.build.watch) {
        resolved.logger.info(
          diagnosticMessage(
            '[ai-i18n] Build Watch 已启用。修改 Vite 配置、插件、提取规则或协议 Schema 后，请重新启动。',
            '[ai-i18n] Build Watch is enabled. Restart after changing Vite config, plugins, extraction rules, or the protocol schema.',
          ),
        );
      }
      ready = Promise.all([
        store.load(),
        store.loadOverrides(),
        writeFrameworkTypes(resolved.root, framework, autoImport, options.dts),
      ]).then(([cache, overrides]) => {
        currentState().hydrateCache(cache);
        currentState().hydrateOverrides(overrides);
      });
      // 部分工具只执行 configResolved 后即释放临时 root；保留 rejection 供后续 hook 抛出，
      // 同时登记观察者，避免未进入任何 hook 时产生 unhandled rejection。
      void ready.catch(() => undefined);
      if (options.provider) {
        const providerOptions = { ...options.provider };
        const { translator, logging } = providerOptions;
        delete providerOptions.cache;
        delete providerOptions.logging;
        coordinator = new ProviderCoordinator(translator, {
          ...providerOptions,
          logging: resolveProviderLogging(
            logging,
            normalizeRoot(resolved.root),
          ),
          async onResults(results, { batchId }) {
            await runStateTask(async () => {
              const project = currentState();
              currentStore().markProviderTranslations(results);
              const affected = project.applyTranslations(results, {
                replaceCached: providerCache === 'fresh',
              });
              currentStore().markProviderBatch(batchId);
              coordinator?.reportBatchEvent({
                batchId,
                stage: 'state-applied',
                resultCount: results.length,
                affectedModules: affected.length,
              });
              if (config?.command !== 'build') {
                const cache = await currentStore().sync(project.snapshot());
                project.hydrateCache(cache);
                project.hydrateOverrides(await currentStore().loadOverrides());
              }
              if (normalized.loading) {
                if (affected.length) {
                  sendLocaleUpdates(results.map((result) => result.locale));
                }
              } else {
                sendTranslationUpdates(affected);
              }
            });
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
            this.warn(ssrWarningMessage('injection'));
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
          reconcile: (moduleIds, complete) =>
            buildWatch.reconcile(moduleIds, complete),
          runStateTask,
        });
        if (localeModule !== undefined) return localeModule;
        const moduleId = decodeURIComponent(
          id.slice(RESOLVED_REGISTER_PREFIX.length),
        );
        return loadRegistration(this, {
          moduleId,
          build: config?.command === 'build',
          project: currentState(),
          store: currentStore(),
          flush: () => coordinator?.flush() ?? Promise.resolve(),
          ...(normalized.loading ? { locale: normalized.sourceLang } : {}),
          runStateTask,
        });
      },
    },

    transform: {
      filter: { id: SOURCE_RE },
      handler: transformSource,
    },

    async renderChunk(code, chunk) {
      return renderLocaleChunk(this, code, chunk.facadeModuleId, {
        project: currentState(),
        store: currentStore(),
        flush: () => coordinator?.flush() ?? Promise.resolve(),
        reconcile: (moduleIds, complete) =>
          buildWatch.reconcile(moduleIds, complete),
      });
    },

    transformIndexHtml: { order: 'pre', handler: transformIndexHtml },

    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        if (config?.command !== 'build') return;
        await buildWatch.reconcile(this.getModuleIds(), true);
        injectBuiltLocaleHints(bundle, config, normalized);
      },
    },

    hotUpdate: handleHotUpdate,

    async closeBundle() {
      disposeDevUpdates();
      if (config?.command !== 'build' || !config.build.watch) {
        await store?.close();
      }
    },
  };
}
