import { createDevPersistenceScheduler } from './dev-persistence.js';
import type { ResolvedConfig } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { ProviderCoordinator } from './provider-coordinator.js';
import { FileStore } from './file-store.js';
import type { FileStoreOptions } from './file-store-types.js';
import { formatTerminalDiagnostic } from './terminal-format.js';
import type { AiI18nOptions } from './options.js';
import type { ProjectState } from './project-state.js';
import type { DevTimingReporter } from './dev-timing.js';
import { writeFrameworkTypes, type AiI18nFramework } from './framework.js';

export function createPluginStore(
  config: ResolvedConfig,
  options: AiI18nOptions,
  storeOptions: FileStoreOptions,
  coordinator: () => ProviderCoordinator | undefined,
): FileStore {
  if (options.provider && typeof options.provider.translator !== 'function') {
    throw new TypeError(
      diagnosticMessage(
        '[ai-i18n] provider.translator 必须是函数。',
        '[ai-i18n] provider.translator must be a function.',
      ),
    );
  }
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
  return new FileStore({
    ...storeOptions,
    onWarning: (message) =>
      config.logger.warn(
        formatTerminalDiagnostic(`[ai-i18n] ${message}`, 'warning'),
      ),
    onSynced(batchIds) {
      for (const batchId of batchIds) {
        coordinator()?.reportBatchEvent({ batchId, stage: 'persisted' });
      }
    },
  });
}

export function initializePlugin(
  config: ResolvedConfig,
  framework: AiI18nFramework,
  options: AiI18nOptions,
  store: FileStore,
  state: ProjectState,
  timing: DevTimingReporter,
) {
  return timing.measure(
    'initialization',
    '<project>',
    async () => {
      const [cache, overrides] = await Promise.all([
        timing.measure('translation-memory-load', '<project>', () =>
          store.load(),
        ),
        timing.measure('overrides-load', '<project>', () =>
          store.loadOverrides(),
        ),
        timing.measure('types-write', '<project>', () =>
          writeFrameworkTypes(
            config.root,
            framework,
            options.autoImport ?? false,
            options.dts,
          ),
        ),
      ]);
      await timing.measure('state-hydrate', '<project>', () => {
        state.hydrateCache(cache);
        state.hydrateOverrides(overrides);
      });
      return cache;
    },
    { localeCount: options.locales.length },
  );
}

export function createPluginPersistence(
  config: () => ResolvedConfig | undefined,
  currentStore: () => FileStore,
  currentState: () => ProjectState,
  timing: DevTimingReporter,
) {
  return createDevPersistenceScheduler({
    snapshot: () => currentState().snapshot(),
    sync: async (snapshot, context) => {
      await currentStore().sync(snapshot, {
        changedSources: context.changedSources,
        timingModuleId: context.moduleId,
      });
    },
    timing,
    onError(cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      config()?.logger.error(
        formatTerminalDiagnostic(
          diagnosticMessage(
            `[ai-i18n] Dev 后台持久化失败：${reason}`,
            `[ai-i18n] Dev background persistence failed: ${reason}`,
          ),
          'error',
        ),
      );
    },
  });
}
