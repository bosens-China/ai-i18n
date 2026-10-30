import type { TranslationMemoryFile } from '@ai-i18n/core';
import type { Plugin } from 'vite';
import type { ScanResult } from './scan-catalog.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { FileStore } from './file-store.js';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';
import type { AiI18nOptions } from './options.js';

export const AI_I18N_PLUGIN_API = Symbol.for('ai-i18n.vite.plugin-api');

export interface AiI18nPluginApi {
  translationSource?: 'remote' | 'overlay';
  /** Skill 扫描在配置解析前启用；不属于应用配置。 */
  scanMode: boolean;
  cacheMode?: boolean;
  cacheOptions: {
    adapter?: import('@ai-i18n/core/translation-memory').TranslationMemoryCandidateCacheAdapter;
    directory?: string;
  };
  scanning?: boolean;
  scanned?: boolean;
  scanPending?: Promise<ScanResult> | undefined;
  scanOptions: unknown;
  scanIgnored: string[];
  scanIgnores(file: string): boolean;
  readonly options: NormalizedAiI18nOptions;
  ready(): Promise<void>;
  state(): ProjectState;
  replaceState(state: ProjectState): void;
  flushProvider(): Promise<void>;
  settleTransforms(task?: () => void): Promise<void>;
  store(): FileStore;
  persistedCache(): TranslationMemoryFile | undefined;
  runStateTask: DevStateTaskRunner;
  flushPersistence(): Promise<void>;
  notify(affectedModuleIds: string[], locale: string): void;
}

export type AiI18nPlugin = Plugin & {
  [AI_I18N_PLUGIN_API]: AiI18nPluginApi;
};

export function createPluginApi(
  options: AiI18nOptions,
  normalized: NormalizedAiI18nOptions,
  lifecycle: Omit<
    AiI18nPluginApi,
    'scanMode' | 'cacheOptions' | 'scanOptions' | 'scanIgnored' | 'options'
  >,
): AiI18nPluginApi {
  return {
    scanMode: false,
    translationSource: options.remote?.load
      ? options.remote.mode === 'overlay'
        ? 'overlay'
        : 'remote'
      : undefined,
    cacheOptions: {
      adapter:
        options.remote?.load && options.remote.mode !== 'overlay'
          ? undefined
          : options.translationMemory?.cache,
      directory: options.directory,
    },
    scanOptions: {
      ...normalized,
      framework: options.framework,
      autoImport: options.autoImport ?? false,
      html: options.html,
      directory: options.directory,
    },
    scanIgnored: [],
    options: normalized,
    ...lifecycle,
  };
}

export function aiI18nPluginApi(plugin: Plugin): AiI18nPluginApi | undefined {
  return (plugin as Partial<AiI18nPlugin>)[AI_I18N_PLUGIN_API];
}

/** 切换扫描状态前等在途转换结束，避免旧任务把结果写回已替换的 Analyzer。 */
export function trackPluginTransforms() {
  const pending = new Set<Promise<unknown>>();
  return {
    track<T>(task: T | Promise<T>): Promise<T> {
      const result = Promise.resolve(task);
      pending.add(result);
      void result.finally(() => pending.delete(result)).catch(() => undefined);
      return result;
    },
    async settle(task?: () => void) {
      while (pending.size) await Promise.allSettled([...pending]);
      task?.();
    },
  };
}
