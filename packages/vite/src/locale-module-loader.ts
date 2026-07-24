import path from 'node:path';
import type { FileStore } from './file-store.js';
import {
  fillLocaleModule,
  localeFromResolvedId,
  localeFromResolvedWrapperId,
  localeModuleCode,
  localeModulePlaceholderCode,
  localeModuleWrapperCode,
} from './locale-loading.js';
import type { ProjectState } from './project-state.js';

interface LocaleModuleLoadContext {
  addWatchFile(file: string): void;
  getModuleIds(): Iterable<string>;
}

interface LocaleModuleLoadOptions {
  id: string;
  build: boolean;
  project: ProjectState;
  store: FileStore;
  flush: () => Promise<void>;
  reconcile: (moduleIds: Iterable<string>) => Promise<void>;
}

export async function loadLocaleModule(
  context: LocaleModuleLoadContext,
  options: LocaleModuleLoadOptions,
): Promise<string | undefined> {
  const wrapperLocale = localeFromResolvedWrapperId(options.id);
  if (wrapperLocale) return localeModuleWrapperCode(wrapperLocale);
  const locale = localeFromResolvedId(options.id);
  if (!locale) return;
  const { project, store } = options;
  if (options.build) return localeModulePlaceholderCode(locale);
  addLocaleWatchFiles(context, project, store);
  return localeModuleCode(project.localeMessages(locale));
}

export async function renderLocaleChunk(
  context: LocaleModuleLoadContext,
  code: string,
  facadeModuleId: string | null,
  options: Omit<LocaleModuleLoadOptions, 'id' | 'build'>,
): Promise<string | null> {
  const locale = facadeModuleId
    ? localeFromResolvedId(facadeModuleId)
    : undefined;
  if (!locale) return null;

  // Framework 模块可能晚于 locale module load；renderChunk 才拥有完整构建图。
  await options.reconcile(context.getModuleIds());
  addLocaleWatchFiles(context, options.project, options.store);
  await options.flush();
  const cache = await options.store.sync(options.project.snapshot());
  options.project.hydrateCache(cache);
  return fillLocaleModule(code, locale, options.project.localeMessages(locale));
}

function addLocaleWatchFiles(
  context: Pick<LocaleModuleLoadContext, 'addWatchFile'>,
  project: ProjectState,
  store: FileStore,
): void {
  const watched = new Set<string>();
  for (const [moduleId, result] of project.modules) {
    if (!result.messages.length) continue;
    watched.add(path.resolve(project.root, moduleId));
    for (const file of store.watchFiles(moduleId)) watched.add(file);
  }
  for (const file of watched) context.addWatchFile(file);
}
