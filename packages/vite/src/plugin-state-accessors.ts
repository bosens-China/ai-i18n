import { diagnosticMessage } from '@ai-i18n/analyzer';
import { FileStore } from './file-store.js';
import { ProjectState } from './project-state.js';

export function createPluginStateAccessors(
  getState: () => ProjectState | undefined,
  getStore: () => FileStore | undefined,
) {
  function currentState(): ProjectState {
    const state = getState();
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

  function currentStore(): FileStore {
    const store = getStore();
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

  return { currentState, currentStore };
}
