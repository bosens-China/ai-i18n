import type { TranslationMemoryFile } from '@ai-i18n/core';
import type { Plugin } from 'vite';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { FileStore } from './file-store.js';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';

export const AI_I18N_PLUGIN_API = Symbol.for('ai-i18n.vite.plugin-api');

export interface AiI18nPluginApi {
  readonly options: NormalizedAiI18nOptions;
  ready(): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  persistedCache(): TranslationMemoryFile | undefined;
  runStateTask: DevStateTaskRunner;
  flushPersistence(): Promise<void>;
  notify(affectedModuleIds: string[], locale: string): void;
}

export type AiI18nPlugin = Plugin & {
  [AI_I18N_PLUGIN_API]: AiI18nPluginApi;
};

export function aiI18nPluginApi(plugin: Plugin): AiI18nPluginApi | undefined {
  return (plugin as Partial<AiI18nPlugin>)[AI_I18N_PLUGIN_API];
}
