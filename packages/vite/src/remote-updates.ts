import path from 'node:path';
import {
  normalizePath,
  type EnvironmentModuleGraph,
  type EnvironmentModuleNode,
  type NormalizedHotChannelClient,
} from 'vite';
import { resolvedLocaleModuleId } from './locale-loading.js';
import type { ProjectState } from './project-state.js';
import type { TranslationMeta } from './runtime.js';

export const REMOTE_UPDATE_EVENT = 'ai-i18n:remote-update';
export const REMOTE_READY_EVENT = 'ai-i18n:remote-ready';

export function sendRemoteUpdate(
  project: ProjectState,
  affected: readonly string[],
  publicMeta: TranslationMeta | undefined,
  graph: EnvironmentModuleGraph | undefined,
  hot: NormalizedHotChannelClient | undefined,
) {
  const invalidated = new Set<EnvironmentModuleNode>();
  const invalidate = (module: EnvironmentModuleNode | undefined) => {
    if (module) graph?.invalidateModule(module, invalidated);
  };
  for (const moduleId of affected) {
    const file = normalizePath(path.resolve(project.root, moduleId));
    for (const module of graph?.getModulesByFile(file) ?? [])
      invalidate(module);
  }
  invalidate(graph?.getModuleById('\0virtual:ai-i18n'));
  const locales = project.options.loading
    ? Object.fromEntries(
        project.options.locales
          .filter(({ value }) => value !== project.options.sourceLang)
          .map(({ value }) => {
            invalidate(graph?.getModuleById(resolvedLocaleModuleId(value)));
            return [value, project.localeMessages(value)];
          }),
      )
    : {};
  hot?.send(REMOTE_UPDATE_EVENT, {
    publicMeta,
    modules: Object.fromEntries(
      affected.map((moduleId) => [
        moduleId,
        project.registration(
          moduleId,
          project.options.loading ? project.options.sourceLang : undefined,
        ),
      ]),
    ),
    locales,
  });
}
