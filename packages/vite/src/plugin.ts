import { type Plugin, type ResolvedConfig, type ViteDevServer } from 'vite';
import { createPluginBuildHooks } from './plugin-build-hooks.js';
import { optimizeDevRuntimeDependencies } from './dev-optimize-deps.js';
import {
  createDevStateQueue,
  type DevStateTaskRunner,
} from './dev-state-queue.js';
import { createDevTimingReporter } from './dev-timing.js';
import { createPerformanceDiagnostics } from './performance-diagnostics.js';
import {
  initializeProject,
  initializeDevServer,
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
import { normalizeProjectId } from './project-paths.js';
import type { AiI18nOptions } from './options.js';
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
import { normalizeOptions, rejectRemovedOptions } from './plugin-utils.js';
import { createSourceTransformHandler } from './source-transform.js';
import { createDevUpdateSender } from './dev-updates.js';
const TRANSLATION_UPDATE_EVENT = 'ai-i18n:update';
const LOCALE_UPDATE_EVENT = 'ai-i18n:locale-update';

export function aiI18n(
  options: AiI18nOptions,
  configDirectory?: string,
): Plugin {
  rejectRemovedOptions(options);
  const normalized = normalizeOptions({
    ...options,
    repository: true,
  });
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
  let devServer: ViteDevServer | undefined;
  let warnedSsr = false;
  const warnSsrOnce = (warn: () => void) => {
    if (warnedSsr) return;
    warnedSsr = true;
    warn();
  };
  const setDevHot = () => {};
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
    configDirectory,
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
  const runStateTask: DevStateTaskRunner = (task) =>
    config?.command === 'build'
      ? Promise.resolve().then(task)
      : queueDevStateTask(task);

  const { sendTranslationUpdates, sendLocaleUpdates } = createDevUpdateSender({
    options: normalized,
    state: currentState,
    hot: () => devServer?.environments.client?.hot,
    moduleGraph: () => devServer?.environments.client?.moduleGraph,
    translationEvent: TRANSLATION_UPDATE_EVENT,
    localeEvent: LOCALE_UPDATE_EVENT,
  });
  const requestMissingTranslations = () => {};
  const persist = () => {};
  const flushProvider = () => Promise.resolve();
  const flushPersistence = () => Promise.resolve();

  const { hooks: buildHooks, reconcile } = createPluginBuildHooks({
    adapter: options.adapter,
    config: () => config,
    ready: () => ready,
    state: currentState,
    store: currentStore,
    normalized,
    summary: options.diagnostics?.buildSummary !== false,
    failOnMissingTranslations: options.failOnMissingTranslations ?? false,
    timing: devTiming,
    performance: performanceDiagnostics,
    closeStore: () => store?.close(),
    requestMissingTranslations,
    flushProvider,
    flushPersistence,
    async dispose(closedConfig) {
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
    flushPersistence,
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
  });

  const api = createPluginApi(options, normalized, {
    scanIgnores: (file) => performanceDiagnostics?.owns(file) ?? false,
    ready: () => ready,
    state: currentState,
    replaceState(next) {
      state = next;
    },
    flushProvider,
    settleTransforms: transforms.settle,
    store: currentStore,
    persistedCache: () => undefined,
    runStateTask,
    flushPersistence,
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
      return measureSetup('config-resolved', () => {
        config = resolved;
        if (!api.scanMode) performanceDiagnostics?.validateDirectory();
        const initialized = initializeProject(
          resolved,
          options,
          normalized,
          api,
          devTiming,
        );
        framework = initialized.framework;
        translationHooks = frameworkTranslationHooks(framework, autoImport);
        state = initialized.state;
        store = initialized.store;
        ready = initialized.ready.then(() => undefined);
        void ready.catch(() => undefined);
      });
    },

    async configureServer(server) {
      devServer = server;
      const close = await measureSetup('configure-server', () =>
        initializeDevServer(server, api, currentStore(), ready),
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
