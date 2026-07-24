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
  locale?: string;
}

export async function loadRegistration(
  context: RegistrationLoadContext,
  options: RegistrationLoadOptions,
): Promise<string> {
  const { moduleId, project, store } = options;
  for (const file of project.registrationWatchFiles(moduleId)) {
    context.addWatchFile(file);
    if (project.normalizeId(file) !== moduleId) {
      await context.load({ id: file });
    }
  }
  for (const file of store.watchFiles(moduleId)) {
    context.addWatchFile(file);
  }
  if (options.build) {
    await options.flush();
    const cache = await store.sync(project.snapshot());
    project.hydrateCache(cache);
  }
  const messages = project.registration(moduleId, options.locale);
  return messages ? registerCode(moduleId, messages) : 'export {}';
}
