import {
  type NormalizedHotChannel,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import type { TranslationMemoryFile } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { createBuildWatchState } from './build-watch.js';
import { createDevPersistenceScheduler } from './dev-persistence.js';
import { optimizeDevRuntimeDependencies } from './dev-optimize-deps.js';
import { createDevUpdateSender } from './dev-updates.js';
import {
  createDevStateQueue,
  type DevStateTaskRunner,
} from './dev-state-queue.js';
import { createDevTimingReporter } from './dev-timing.js';
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
import { injectBuiltLocaleHints } from './locale-loading.js';
import { renderLocaleChunk } from './locale-module-loader.js';
import { ProjectState } from './project-state.js';
import type { ProviderCoordinator } from './provider-coordinator.js';
import { configureReviewServer } from './review-server.js';
import { createReviewService } from './review-service.js';
import { normalizeProjectId } from './project-paths.js';
import type { AiI18nOptions } from './options.js';
import { createPluginProvider } from './plugin-provider.js';
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
  const queueDevStateTask = createDevStateQueue();
  const devTiming = createDevTimingReporter(options.diagnostics?.timing, {
    enabled: () => config?.command === 'serve',
    log: (message) => config?.logger.info(message),
  });
  const devPersistence = createDevPersistenceScheduler({
    snapshot: () => currentState().snapshot(),
    sync: async (snapshot, context) => {
      await currentStore().sync(snapshot, {
        changedSources: context.changedSources,
        timingModuleId: context.moduleId,
      });
    },
    timing: devTiming,
    onError(cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      config?.logger.error(
        diagnosticMessage(
          `[ai-i18n] Dev 后台持久化失败：${reason}`,
          `[ai-i18n] Dev background persistence failed: ${reason}`,
        ),
      );
    },
  });

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

  const reviewService = createReviewService({
    sourceLang: normalized.sourceLang,
    locales: normalized.locales,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    loadPersistedExtracted: () => currentStore().loadExtracted(),
    persistedCache: () => reviewCache,
    runStateTask,
    flushPersistence: () => devPersistence.flush(),
    notify(affectedModuleIds, locale) {
      if (normalized.loading) sendLocaleUpdates([locale]);
      else sendTranslationUpdates(affectedModuleIds);
    },
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
  const transformSource: typeof handleTransformSource = function (
    code,
    id,
    transformOptions,
  ) {
    const moduleId = config
      ? (normalizeProjectId(config.root, id) ?? '<unknown>')
      : '<unknown>';
    return devTiming.measure('source-transform', moduleId, () =>
      handleTransformSource.call(this, code, id, transformOptions),
    );
  };

  const transformIndexHtml = createHtmlTransformHandler({
    ...(htmlExtractor ? { extractor: htmlExtractor } : {}),
    options: normalized,
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    requestMissingTranslations,
    flush: () => coordinator?.flush() ?? Promise.resolve(),
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
    flushProvider: () => coordinator?.flush() ?? Promise.resolve(),
    reconcile: (moduleIds, complete) =>
      buildWatch.reconcile(moduleIds, complete),
    runStateTask,
    warnSsrOnce(warn) {
      if (warnedSsr) return;
      warnedSsr = true;
      warn();
    },
    translationUpdateEvent: TRANSLATION_UPDATE_EVENT,
    localeUpdateEvent: LOCALE_UPDATE_EVENT,
  });

  return {
    name: 'ai-i18n',
    enforce: 'pre',
    config: (_userConfig, environment) =>
      optimizeDevRuntimeDependencies(environment),

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
        translationMemory,
        timing: devTiming,
        ...(translationMemory.capacity
          ? { capacity: translationMemory.capacity }
          : {}),
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
        });
      }
    },

    configureServer(server) {
      // Dev 注册不再依附虚拟注册模块，目录观察必须独立存在，才能接收 MCP 与校对页写入。
      server.watcher.add(currentStore().directory);
      void ready
        .then(() => server.watcher.add(currentStore().devWatchTargets()))
        .catch(() => undefined);
      if (options.review !== false)
        return configureReviewServer(server, reviewService);
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

    ...virtualModuleHooks,

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
      await devPersistence.flush();
      if (config?.command !== 'build' || !config.build.watch) {
        await store?.close();
      }
    },
  };
}
