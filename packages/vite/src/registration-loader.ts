import { normalizePath } from 'vite';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { FileStore } from './file-store.js';
import type { ProjectState } from './project-state.js';
import { registerCode } from './virtual-modules.js';

interface RegistrationLoadContext {
  addWatchFile(file: string): void;
  load(options: { id: string }): Promise<unknown>;
}

interface RegistrationLoadOptions {
  moduleId: string;
  build: boolean;
  project: ProjectState;
  store: FileStore;
  flush: () => Promise<void>;
  runStateTask?: DevStateTaskRunner;
  locale?: string;
}

export async function loadRegistration(
  context: RegistrationLoadContext,
  options: RegistrationLoadOptions,
): Promise<string> {
  const { moduleId, project, store } = options;
  const runStateTask: DevStateTaskRunner =
    options.runStateTask ??
    ((task) => {
      return Promise.resolve().then(task);
    });
  const projectFiles = await runStateTask(() => ({
    load: project.registrationLoadFiles(moduleId),
    watch: project.registrationWatchFiles(moduleId),
  }));
  for (const file of projectFiles.watch) {
    context.addWatchFile(file);
  }
  for (const file of projectFiles.load) {
    await context.load({ id: normalizePath(file) });
  }
  for (const file of store.watchFiles(moduleId)) {
    context.addWatchFile(file);
  }
  if (options.build) {
    await options.flush();
    project.hydrateOverrides(await store.loadOverrides());
  }
  const messages = await runStateTask(() =>
    project.registration(moduleId, options.locale),
  );
  return messages ? registerCode(moduleId, messages) : 'export {}';
}
