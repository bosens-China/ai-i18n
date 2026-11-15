import type { ResolvedConfig, ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { FileStore } from './file-store.js';
import type { FileStoreOptions } from './file-store-types.js';
import { formatTerminalDiagnostic } from './terminal-format.js';
import type { AiI18nOptions } from './options.js';
import { ProjectState, type NormalizedAiI18nOptions } from './project-state.js';
import { normalizeRoot } from './plugin-utils.js';
import type { AiI18nPluginApi } from './plugin-api.js';
import type { DevTimingReporter } from './dev-timing.js';
import {
  writeFrameworkTypes,
  resolveFramework,
  type AiI18nFramework,
} from './framework.js';
import path from 'node:path';
import { startScanBridge } from './scan-bridge.js';
import { serveRepositoryFiles } from './repository-dev-files.js';

export function initializeProject(
  config: ResolvedConfig,
  options: AiI18nOptions,
  normalized: NormalizedAiI18nOptions,
  api: AiI18nPluginApi,
  timing: DevTimingReporter,
) {
  const framework = resolveFramework(config.plugins, options.framework);
  api.scanIgnored = [
    path.resolve(
      config.root,
      typeof options.dts === 'string' ? options.dts : 'src/ai-i18n.d.ts',
    ),
  ];
  const state = new ProjectState(normalizeRoot(config.root), normalized);
  const store = createPluginStore(config, {
    root: state.root,
    sourceLang: normalized.sourceLang,
    locales: normalized.locales,
    ...(options.directory ? { directory: options.directory } : {}),
  });
  const ready = initializePlugin(
    config,
    framework,
    api.scanMode ? { ...options, dts: false } : options,
    store,
    state,
    timing,
  );
  // 某些调用方只解析配置；保留 rejection 给后续 hook，同时避免未观察的异步错误。
  void ready.catch(() => undefined);
  return { state, store, ready, framework };
}

export async function initializeDevServer(
  server: ViteDevServer,
  api: AiI18nPluginApi,
  store: FileStore,
  ready: Promise<void>,
) {
  if (store.repository) serveRepositoryFiles(server, store.repository);
  const close = api.scanMode ? undefined : await startScanBridge(server, api);
  server.watcher.add(store.directory);
  void ready
    .then(() => server.watcher.add(store.devWatchTargets()))
    .catch(() => undefined);
  return close;
}

export function createPluginStore(
  config: ResolvedConfig,
  storeOptions: FileStoreOptions,
): FileStore {
  if (config.command === 'build' && config.build.watch) {
    config.logger.info(
      formatTerminalDiagnostic(
        diagnosticMessage(
          '[ai-i18n] Build Watch 已启用。修改 Vite 配置、插件、提取规则或协议 Schema 后，请重新启动。',
          '[ai-i18n] Build Watch is enabled. Restart after changing Vite config, plugins, extraction rules, or the protocol schema.',
        ),
        'info',
      ),
    );
  }
  return new FileStore(storeOptions);
}

export function initializePlugin(
  config: ResolvedConfig,
  framework: AiI18nFramework,
  options: AiI18nOptions,
  _store: FileStore,
  _state: ProjectState,
  timing: DevTimingReporter,
) {
  return timing.measure(
    'initialization',
    '<project>',
    async () => {
      await timing.measure('types-write', '<project>', () =>
        writeFrameworkTypes(
          config.root,
          framework,
          options.autoImport ?? false,
          options.dts,
        ),
      );
    },
    { localeCount: options.locales.length },
  );
}
