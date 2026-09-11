import {
  type NormalizedHotChannel,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import type { TranslationMemoryFile } from '@ai-i18n/core';
import { createBuildWatchState } from './build-watch.js';
import { optimizeDevRuntimeDependencies } from './dev-optimize-deps.js';
import { createDevUpdateSender } from './dev-updates.js';
import {
  createDevStateQueue,
  type DevStateTaskRunner,
} from './dev-state-queue.js';
import { createDevTimingReporter } from './dev-timing.js';
import { createPerformanceDiagnostics } from './performance-diagnostics.js';
import {
  initializePlugin,
  createPluginStore,
  createPluginPersistence,
} from './plugin-initialization.js';
import type { FileStore } from './file-store.js';
import {
  frameworkTranslationHooks,
  resolveFramework,
  SOURCE_RE,
  type AiI18nFramework,
} from './framework.js';
import { html as createHtmlExtractor, type HtmlExtractor } from './html.js';
import { createHtmlTransformHandler } from './html-transform.js';
import { createHotUpdateHandler } from './hot-update.js';
import { injectBuiltLocaleHints } from './locale-loading.js';
import { renderLocaleChunk } from './locale-module-loader.js';
import { ProjectState } from './project-state.js';
import type { ProviderCoordinator } from './provider-coordinator.js';
import { normalizeProjectId } from './project-paths.js';
import type { AiI18nOptions } from './options.js';
import { createPluginProvider } from './plugin-provider.js';
import {
  AI_I18N_PLUGIN_API,
  type AiI18nPlugin,
  type AiI18nPluginApi,
} from './plugin-api.js';
import { createPluginStateAccessors } from './plugin-state-accessors.js';
import {
  createVirtualModuleHooks,
  REGISTER_PREFIX,
} from './plugin-virtual-hooks.js';
import {
  normalizeOptions,
  normalizeProviderCache,
  normalizeRoot,
  normalizeTranslationMemory,
  rejectRemovedOptions,
} from './plugin-utils.js';
import { createSourceTransformHandler } from './source-transform.js';
import { formatTerminalDiagnostic } from './terminal-format.js';
const TRANSLATION_UPDATE_EVENT = 'ai-i18n:update';
const LOCALE_UPDATE_EVENT = 'ai-i18n:locale-update';

export function aiI18n(options: AiI18nOptions): Plugin {
  rejectRemovedOptions(options);
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
  let reviewCache: TranslationMemoryFile | undefined;
  let coordinator: ProviderCoordinator | undefined;
  let devHot: NormalizedHotChannel | undefined;
  let warnedSsr = false;
  const { currentState, currentStore } = createPluginStateAccessors(
    () => state,
    () => store,
  );
  const performanceDiagnostics = createPerformanceDiagnostics(
    options.diagnostics?.performance,
    () => config,
    () => framework,
    options.directory,
  );
  const measureSetup = <T>(stage: string, task: () => T): T =>
    performanceDiagnostics
      ? performanceDiagnostics.recorder.measureSync(stage, '<project>', task)
      : task();
  const queueDevStateTask = createDevStateQueue(
    performanceDiagnostics?.recorder,
  );
  const devTiming = createDevTimingReporter(options.diagnostics?.timing, {
    performance: performanceDiagnostics?.recorder,
    enabled: () => config?.command === 'serve',
    log: (message) => config?.logger.info(message),
  });
  const devPersistence = createPluginPersistence(
    () => config,
    currentStore,
    currentState,
    devTiming,
  );

  const runStateTask: DevStateTaskRunner = (task) =>
    config?.command === 'build'
      ? Promise.resolve().then(task)
      : queueDevStateTask(task);

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
      if (config?.command === 'serve') {
        config.logger?.info(formatTerminalDiagnostic(message, 'info'));
      }
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
  const reconcile = (moduleIds: Iterable<string>, complete = false) =>
    devTiming.measure('build-reconcile', '<project>', () =>
      buildWatch.reconcile(moduleIds, complete),
    );
  const flushProvider = () =>
    devTiming.measure(
      'provider-flush',
      '<project>',
      () => coordinator?.flush() ?? Promise.resolve(),
    );

  const handleHotUpdate = createHotUpdateHandler({
    sourcePattern: SOURCE_RE,
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
    flushPersistence: () => devPersistence.flush(),
    runStateTask,
  });

  const handleTransformSource = createSourceTransformHandler({
    registerPrefix: REGISTER_PREFIX,
    ...(normalized.loading
      ? { registrationLocale: normalized.sourceLang }
      : {}),
    config: () => config,
    ready: () => ready,
    state: currentState,
    moduleId: (id) =>
      config
        ? (normalizeProjectId(config.root, id) ?? '<unknown>')
        : '<unknown>',
    timing: devTiming,
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
    persist: (moduleId) => devPersistence.schedule(moduleId),
  });
  const transformIndexHtml = createHtmlTransformHandler({
    ...(htmlExtractor ? { extractor: htmlExtractor } : {}),
    options: normalized,
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    requestMissingTranslations,
    flush: flushProvider,
    persist: (moduleId) => devPersistence.schedule(moduleId),
    setDevHot(hot) {
      devHot = hot;
    },
    runStateTask,
  });

  const virtualModuleHooks = createVirtualModuleHooks({
    normalized,
    config: () => config,
    framework: () => framework,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    flushProvider,
    reconcile,
    runStateTask,
    warnSsrOnce(warn) {
      if (warnedSsr) return;
      warnedSsr = true;
      warn();
    },
    translationUpdateEvent: TRANSLATION_UPDATE_EVENT,
    localeUpdateEvent: LOCALE_UPDATE_EVENT,
  });

  const api: AiI18nPluginApi = {
    options: normalized,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    persistedCache: () => reviewCache,
    runStateTask,
    flushPersistence: () => devPersistence.flush(),
    notify(affectedModuleIds, locale) {
      if (normalized.loading) sendLocaleUpdates([locale]);
      else sendTranslationUpdates(affectedModuleIds);
    },
  };

  const plugin: AiI18nPlugin = {
    name: 'ai-i18n',
    enforce: 'pre',
    config: (_userConfig, environment) =>
      measureSetup('config', () => optimizeDevRuntimeDependencies(environment)),

    configResolved(resolved) {
      return measureSetup('config-resolved', () => {
        config = resolved;
        performanceDiagnostics?.validateDirectory();
        framework = resolveFramework(resolved.plugins, options.framework);
        translationHooks = frameworkTranslationHooks(framework, autoImport);
        state = new ProjectState(normalizeRoot(resolved.root), normalized);
        store = createPluginStore(
          resolved,
          options,
          {
            root: normalizeRoot(resolved.root),
            sourceLang: normalized.sourceLang,
            locales: normalized.locales,
            ...(options.directory ? { directory: options.directory } : {}),
            cleanupMissingSourceFiles:
              options.cleanup?.missingSourceFiles ?? true,
            cleanupOrphanMessages: options.cleanup?.orphanMessages ?? false,
            translationMemory,
            timing: devTiming,
            ...(translationMemory.capacity
              ? { capacity: translationMemory.capacity }
              : {}),
          },
          () => coordinator,
        );
        ready = initializePlugin(
          resolved,
          framework,
          options,
          store,
          state,
          devTiming,
        ).then((cache) => {
          reviewCache = cache;
        });
        // 部分工具只执行 configResolved 后即释放临时 root；保留 rejection 供后续 hook 抛出，
        // 同时登记观察者，避免未进入任何 hook 时产生 unhandled rejection。
        void ready.catch(() => undefined);
        if (options.provider) {
          coordinator = createPluginProvider({
            provider: options.provider,
            providerCache,
            config: resolved,
            state: currentState,
            store: currentStore,
            runStateTask,
            flushPersistence: () => devPersistence.flush(),
            localeLoading: normalized.loading !== undefined,
            sendTranslationUpdates,
            sendLocaleUpdates,
            performance: performanceDiagnostics?.recorder,
          });
        }
      });
    },

    configureServer(server) {
      return measureSetup('configure-server', () => {
        // Dev 注册不再依附虚拟注册模块，目录观察必须独立存在，才能接收 MCP 与校对页写入。
        server.watcher.add(currentStore().directory);
        void ready
          .then(() => server.watcher.add(currentStore().devWatchTargets()))
          .catch(() => undefined);
      });
    },

    async buildStart() {
      if (config?.command === 'build') {
        await devTiming.measure('build-start', '<project>', () =>
          buildWatch.buildStart(this.meta.watchMode),
        );
      }
    },

    async watchChange(id, change) {
      if (config?.command === 'build' && this.meta.watchMode) {
        await buildWatch.watchChange(id, change.event);
      }
    },

    ...virtualModuleHooks,

    transform: {
      filter: { id: SOURCE_RE },
      handler: handleTransformSource,
    },

    async renderChunk(code, chunk) {
      return devTiming.measure('locale-render', '<project>', () =>
        renderLocaleChunk(this, code, chunk.facadeModuleId, {
          project: currentState(),
          store: currentStore(),
          flush: flushProvider,
          reconcile,
        }),
      );
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return devTiming.measure('html-transform', '<html>', () =>
          transformIndexHtml.call(this, html, context),
        );
      },
    },

    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        if (config?.command !== 'build') return;
        await reconcile(this.getModuleIds(), true);
        injectBuiltLocaleHints(bundle, config, normalized);
      },
    },

    hotUpdate(options) {
      // 报告自身的写入不再触发采集，避免周期性 HMR / 报告自激。
      if (performanceDiagnostics?.owns(options.file)) return [];
      const moduleId = config
        ? (normalizeProjectId(config.root, options.file) ?? '<project>')
        : '<project>';
      return devTiming.measure('hot-update', moduleId, () =>
        handleHotUpdate.call(this, options),
      );
    },

    async closeBundle() {
      try {
        disposeDevUpdates();
        await devPersistence.flush();
        if (config?.command !== 'build' || !config.build.watch) {
          await store?.close();
        }
      } finally {
        await performanceDiagnostics?.close();
      }
    },
    [AI_I18N_PLUGIN_API]: api,
  };
  return plugin;
}
