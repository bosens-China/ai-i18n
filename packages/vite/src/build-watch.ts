import type { FileStore } from './file-store.js';
import type { ProjectState } from './project-state.js';
import { isInternalStoreFile } from './file-store-paths.js';

interface BuildWatchDependencies {
  sourcePattern: RegExp;
  ready: () => Promise<void>;
  state: () => ProjectState;
  store: () => FileStore;
}

export function createBuildWatchState(dependencies: BuildWatchDependencies) {
  const deletedSources = new Set<string>();
  const managedChanges = new Set<string>();
  let fullyReconciled = false;

  return {
    async watchChange(
      file: string,
      event: 'create' | 'update' | 'delete',
    ): Promise<void> {
      await dependencies.ready();
      const store = dependencies.store();
      if (isInternalStoreFile(store.directory, file)) return;
      if (store.manages(file)) {
        managedChanges.add(file);
        return;
      }
      if (event === 'delete' && dependencies.sourcePattern.test(file)) {
        deletedSources.add(file);
      }
    },

    async buildStart(watchMode: boolean): Promise<void> {
      await dependencies.ready();
      fullyReconciled = false;
      const project = dependencies.state();
      if (!watchMode) {
        project.reset();
        return;
      }

      const deleted = [...deletedSources];
      const changed = [...managedChanges];
      deletedSources.clear();
      managedChanges.clear();
      if (!deleted.length && !changed.length) return;

      for (const file of deleted) project.remove(file);
    },

    async reconcile(
      moduleIds: Iterable<string>,
      complete = false,
    ): Promise<void> {
      const project = dependencies.state();
      const removed = project.retain(moduleIds);
      if (!removed.length && (!complete || fullyReconciled)) return;
      // Watch 状态可以跨轮次复用，但活动模块必须以当前 Vite 图为准。
      if (complete) fullyReconciled = true;
    },
  };
}
