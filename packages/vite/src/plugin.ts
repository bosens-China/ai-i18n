import {
  type NormalizedHotChannel,
  type Plugin,
  type ResolvedConfig,
  type ViteDevServer,
} from 'vite';
import type { TranslationMemoryFile } from '@ai-i18n/core';
import { createPluginBuildHooks } from './plugin-build-hooks.js';
import { optimizeDevRuntimeDependencies } from './dev-optimize-deps.js';
import { createDevUpdateSender } from './dev-updates.js';
import {
  createDevStateQueue,
  type DevStateTaskRunner,
} from './dev-state-queue.js';
import { createDevTimingReporter } from './dev-timing.js';
import { createPerformanceDiagnostics } from './performance-diagnostics.js';
import {
  initializeProject,
  initializeDevServer,
  createPluginPersistence,
} from './plugin-initialization.js';
import type { FileStore } from './file-store.js';
import {
  frameworkTranslationHooks,
  SOURCE_RE,
  type AiI18nFramework,
} from './framework.js';
import { html as createHtmlExtractor } from './html.js';
import { createHtmlTransformHandler } from './html-transform.js';
import { createHotUpdateHandler, wrapHotUpdate } from './hot-update.js';
import type { ProjectState } from './project-state.js';
import type { ProviderCoordinator } from './provider-coordinator.js';
import { normalizeProjectId } from './project-paths.js';
import type { AiI18nOptions } from './options.js';
import { createPluginProvider } from './plugin-provider.js';
import {
  AI_I18N_PLUGIN_API,
  createPluginApi,
  trackPluginTransforms,
  type AiI18nPlugin,
} from './plugin-api.js';
import { createPluginStateAccessors } from './plugin-state-accessors.js';
import {
  createVirtualModuleHooks,
  REGISTER_PREFIX,
} from './plugin-virtual-hooks.js';
import {
  normalizeOptions,
  normalizeProviderCache,
  normalizeTranslationMemory,
  rejectRemovedOptions,
} from './plugin-utils.js';
import { createSourceTransformHandler } from './source-transform.js';
import { formatTerminalDiagnostic } from './terminal-format.js';
import { validateRemote } from './remote-validation.js';
import { createPluginRemote } from './plugin-remote.js';
import { sendRemoteUpdate } from './remote-updates.js';
const TRANSLATION_UPDATE_EVENT = 'ai-i18n:update';
const LOCALE_UPDATE_EVENT = 'ai-i18n:locale-update';

export function aiI18n(options: AiI18nOptions): Plugin {
  rejectRemovedOptions(options);
  validateRemote(options.remote, options.provider);
  const normalized = normalizeOptions(options);
  const translationMemory = normalizeTranslationMemory(
    options.translationMemory,
  );
  const providerCache = normalizeProviderCache(options.provider?.cache);
  const htmlExtractor =
    options.html === false
      ? undefined
      : createHtmlExtractor(options.html === true ? undefined : options.html);
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
  let devServer: ViteDevServer | undefined;
  let warnedSsr = false;
  const warnSsrOnce = (warn: () => void) => {
    if (warnedSsr) return;
    warnedSsr = true;
    warn();
  };
  const setDevHot = (hot: NormalizedHotChannel) => {
    devHot = hot;
  };
  const transforms = trackPluginTransforms();
  const closeScanBridges = new Map<ResolvedConfig, () => Promise<void>>();
  const { currentState, currentStore } = createPluginStateAccessors(
    () => state,
    () => store,
  );
  const performanceDiagnostics = createPerformanceDiagnostics(
    options.diagnostics?.performance,
    () => (api.scanMode ? undefined : config),
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
    enabled: () =>
      !api.scanMode && !api.scanning && config?.command === 'serve',
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
    requestMissingTranslations: requestDevTranslations,
    dispose: disposeDevUpdates,
  } = createDevUpdateSender({
    options: normalized,
    state: currentState,
    hot: () => devHot,
    moduleGraph: () => devServer?.environments.client?.moduleGraph,
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
  const requestMissingTranslations = async (moduleIds: readonly string[]) => {
    if (api.scanMode || api.scanning) return;
    if (config?.command === 'serve') remote?.schedule();
    if (options.remote?.load) return;
    if (translationMemory.cache && providerCache !== 'fresh') {
      const project = currentState();
      const affected = project.hydrateCache(
        await currentStore().syncMemory(project.snapshot()),
      );
      if (affected.length) {
        sendTranslationUpdates(affected);
        sendLocaleUpdates(normalized.locales.map((locale) => locale.value));
      }
    }
    requestDevTranslations(moduleIds);
  };
  const persist = (moduleId: string) => {
    if (!api.scanMode && !api.scanning) devPersistence.schedule(moduleId);
  };
  const remote = options.remote
    ? createPluginRemote({
        adapter: options.remote,
        config: () => config,
        state: currentState,
        store: currentStore,
        runStateTask,
        flushPersistence: () => devPersistence.flush(),
        notify: (affected, meta) =>
          sendRemoteUpdate(
            currentState(),
            affected,
            meta,
            devServer?.environments.client?.moduleGraph,
            devHot,
          ),
      })
    : undefined;
  const flushProvider = () =>
    devTiming.measure(
      'provider-flush',
      '<project>',
      () => coordinator?.flush() ?? Promise.resolve(),
    );

  const { hooks: buildHooks, reconcile } = createPluginBuildHooks({
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    normalized,
    summary: options.diagnostics?.buildSummary !== false,
    failOnMissingTranslations: options.failOnMissingTranslations ?? false,
    timing: devTiming,
    performance: performanceDiagnostics,
    remote,
    remoteBuild: remote?.buildValues,
    closeStore: () => store?.close(),
    requestMissingTranslations,
    flushProvider,
    flushPersistence: () => devPersistence.flush(),
    async dispose(closedConfig) {
      disposeDevUpdates();
      if (closedConfig.command !== 'build' || !closedConfig.build.watch)
        await remote?.close();
      const close = closeScanBridges.get(closedConfig);
      closeScanBridges.delete(closedConfig);
      return close?.();
    },
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
    scanning: () => api.scanMode && Boolean(api.scanning),
    moduleId: (id) =>
      config
        ? (normalizeProjectId(config.root, id) ?? '<unknown>')
        : '<unknown>',
    timing: devTiming,
    framework: () => framework,
    autoImport: () => autoImport,
    translationHooks: () => translationHooks,
    requestMissingTranslations,
    setDevHot,
    warnSsrOnce,
    runStateTask,
    persist,
  });
  const transformIndexHtml = createHtmlTransformHandler({
    remoteBuild: remote?.buildValues,
    ...(htmlExtractor ? { extractor: htmlExtractor } : {}),
    options: normalized,
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    requestMissingTranslations,
    flush: flushProvider,
    persist,
    setDevHot,
    runStateTask,
  });

  const virtualModuleHooks = createVirtualModuleHooks({
    remoteBuild: remote?.buildValues,
    translationMeta: () => remote?.meta(),
    normalized,
    config: () => config,
    framework: () => framework,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    flushProvider,
    reconcile,
    runStateTask,
    warnSsrOnce,
    translationUpdateEvent: TRANSLATION_UPDATE_EVENT,
    localeUpdateEvent: LOCALE_UPDATE_EVENT,
  });

  const api = createPluginApi(options, normalized, {
    scanIgnores: (file) => performanceDiagnostics?.owns(file) ?? false,
    ready: () => ready,
    state: currentState,
    replaceState(next) {
      state = next;
    },
    async flushProvider() {
      await flushProvider();
      await remote?.settle();
    },
    settleTransforms: transforms.settle,
    store: currentStore,
    persistedCache: () => reviewCache,
    runStateTask,
    flushPersistence: () => devPersistence.flush(),
    notify(affectedModuleIds, locale) {
      if (normalized.loading) sendLocaleUpdates([locale]);
      else sendTranslationUpdates(affectedModuleIds);
    },
  });

  const plugin: AiI18nPlugin = {
    name: 'ai-i18n',
    enforce: 'pre',
    config: (_userConfig, environment) =>
      measureSetup('config', () => optimizeDevRuntimeDependencies(environment)),

    configResolved(resolved) {
      if (api.cacheMode) return;
      return measureSetup('config-resolved', () => {
        config = resolved;
        if (!api.scanMode) performanceDiagnostics?.validateDirectory();
        const initialized = initializeProject(
          resolved,
          options,
          normalized,
          api,
          devTiming,
          translationMemory,
          () => coordinator,
        );
        framework = initialized.framework;
        translationHooks = frameworkTranslationHooks(framework, autoImport);
        state = initialized.state;
        store = initialized.store;
        ready = initialized.ready.then((cache) => {
          reviewCache = cache;
        });
        void ready.catch(() => undefined);
        if (options.provider && !api.scanMode) {
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

    async configureServer(server) {
      devServer = server;
      const close = await measureSetup('configure-server', () =>
        initializeDevServer(server, api, currentStore(), ready, remote),
      );
      if (close) closeScanBridges.set(server.config, close);
    },

    ...buildHooks,

    ...virtualModuleHooks,

    transform: {
      filter: { id: SOURCE_RE },
      handler(...args) {
        return transforms.track(handleTransformSource.apply(this, args));
      },
    },

    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        return transforms.track(
          devTiming.measure('html-transform', '<html>', () =>
            transformIndexHtml.call(this, html, context),
          ),
        );
      },
    },

    hotUpdate: wrapHotUpdate(handleHotUpdate, {
      store: currentStore,
      scanPending: () => api.scanPending,
      ignores: (file) => performanceDiagnostics?.owns(file) ?? false,
      root: () => config?.root,
      timing: devTiming,
    }),

    [AI_I18N_PLUGIN_API]: api,
  };
  return plugin;
}
