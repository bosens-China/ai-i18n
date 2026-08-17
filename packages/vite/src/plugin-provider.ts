import type { ResolvedConfig } from 'vite';
import type { AiI18nProviderOptions } from './options.js';
import type { FileStore } from './file-store.js';
import type { ProjectState } from './project-state.js';
import { ProviderCoordinator } from './provider-coordinator.js';
import { resolveProviderLogging } from './provider-logging.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import { normalizeRoot } from './plugin-utils.js';

interface CreatePluginProviderOptions {
  provider: AiI18nProviderOptions;
  providerCache: 'reuse' | 'fresh';
  config: ResolvedConfig;
  state(): ProjectState;
  store(): FileStore;
  runStateTask: DevStateTaskRunner;
  flushPersistence(): Promise<void>;
  localeLoading: boolean;
  sendTranslationUpdates(moduleIds: readonly string[]): void;
  sendLocaleUpdates(locales: readonly string[]): void;
}

export function createPluginProvider(
  options: CreatePluginProviderOptions,
): ProviderCoordinator {
  const providerOptions = { ...options.provider };
  const { translator, logging } = providerOptions;
  delete providerOptions.cache;
  delete providerOptions.logging;

  const coordinator = new ProviderCoordinator(translator, {
    ...providerOptions,
    logging: resolveProviderLogging(
      logging,
      normalizeRoot(options.config.root),
    ),
    async onResults(results, { batchId }) {
      await options.runStateTask(async () => {
        await options.flushPersistence();
        const project = options.state();
        const store = options.store();
        store.markProviderTranslations(results);
        const affected = project.applyTranslations(results, {
          replaceCached: options.providerCache === 'fresh',
        });
        store.markProviderBatch(batchId);
        coordinator.reportBatchEvent({
          batchId,
          stage: 'state-applied',
          resultCount: results.length,
          affectedModules: affected.length,
        });
        if (options.config.command !== 'build') {
          const cache = await store.sync(project.snapshot());
          project.hydrateCache(cache);
          project.hydrateOverrides(await store.loadOverrides());
        }
        if (options.localeLoading) {
          if (affected.length) {
            options.sendLocaleUpdates(results.map((result) => result.locale));
          }
        } else {
          options.sendTranslationUpdates(affected);
        }
      });
    },
    onWarning(message) {
      options.config.logger.warn(`[ai-i18n] ${message}`);
    },
  });
  return coordinator;
}
