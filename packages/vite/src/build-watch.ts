import type { FileStore, FileStoreLoadOptions } from './file-store.js';
import type { ProjectState } from './project-state.js';

interface BuildWatchDependencies {
  sourcePattern: RegExp;
  ready: () => Promise<void>;
  state: () => ProjectState;
  store: () => FileStore;
  requestMissingTranslations: (moduleIds: readonly string[]) => void;
}

export function createBuildWatchState(dependencies: BuildWatchDependencies) {
  const deletedSources = new Set<string>();
  const managedChanges = new Set<string>();

  return {
    async watchChange(
      file: string,
      event: 'create' | 'update' | 'delete',
    ): Promise<void> {
      await dependencies.ready();
      const store = dependencies.store();
      if (store.manages(file)) {
        if (event !== 'delete' && (await store.isOwnFile(file))) return;
        managedChanges.add(file);
        return;
      }
      if (event === 'delete' && dependencies.sourcePattern.test(file)) {
        deletedSources.add(file);
      }
    },

    async buildStart(watchMode: boolean): Promise<void> {
      await dependencies.ready();
      const project = dependencies.state();
      const store = dependencies.store();
      if (!watchMode) {
        project.reset();
        project.hydrateCache(await store.load());
        return;
      }

      const deleted = [...deletedSources];
      const changed = [...managedChanges];
      deletedSources.clear();
      managedChanges.clear();
      if (!deleted.length && !changed.length) return;

      const affected = deleted.flatMap((file) => project.remove(file));
      const loadOptions: FileStoreLoadOptions = store.loadOptions(changed);
      if (changed.length) {
        affected.push(...project.hydrateCache(await store.load(loadOptions)));
      }
      const cache = await store.sync(project.snapshot(), loadOptions);
      affected.push(...project.hydrateCache(cache));
      dependencies.requestMissingTranslations(affected);
    },

    async reconcile(moduleIds: Iterable<string>): Promise<void> {
      const project = dependencies.state();
      const removed = project.retain(moduleIds);
      if (!removed.length) return;
      // Watch 状态可以跨轮次复用，但活动模块必须以当前 Vite 图为准。
      const cache = await dependencies.store().sync(project.snapshot());
      project.hydrateCache(cache);
    },
  };
}
