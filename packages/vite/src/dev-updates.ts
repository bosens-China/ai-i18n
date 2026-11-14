import path from 'node:path';
import {
  normalizePath,
  type EnvironmentModuleGraph,
  type EnvironmentModuleNode,
  type NormalizedHotChannel,
} from 'vite';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';
import { resolvedLocaleModuleId } from './locale-loading.js';

interface DevUpdateDependencies {
  options: NormalizedAiI18nOptions;
  state(): ProjectState;
  hot(): NormalizedHotChannel | undefined;
  moduleGraph(): EnvironmentModuleGraph | undefined;
  translationEvent: string;
  localeEvent: string;
}

export function createDevUpdateSender(dependencies: DevUpdateDependencies) {
  const targetLocales = new Set(
    dependencies.options.locales
      .map((locale) => locale.value)
      .filter((locale) => locale !== dependencies.options.sourceLang),
  );
  return {
    sendTranslationUpdates(moduleIds: readonly string[]) {
      const project = dependencies.state();
      const graph = dependencies.moduleGraph();
      const invalidated = new Set<EnvironmentModuleNode>();
      for (const moduleId of new Set(moduleIds)) {
        // 注册译文已内联到源码；通知当前页面前先清除缓存，保证后续请求也拿到新值。
        const file = normalizePath(path.resolve(project.root, moduleId));
        for (const module of graph?.getModulesByFile(file) ?? []) {
          graph!.invalidateModule(module, invalidated);
        }
        const messages = project.registration(
          moduleId,
          dependencies.options.loading
            ? dependencies.options.sourceLang
            : undefined,
        );
        if (messages) {
          dependencies.hot()?.send(dependencies.translationEvent, {
            moduleId,
            messages,
          });
        }
      }
    },

    sendLocaleUpdates(locales: readonly string[]) {
      if (!dependencies.options.loading) return;
      const project = dependencies.state();
      const graph = dependencies.moduleGraph();
      const invalidated = new Set<EnvironmentModuleNode>();
      for (const locale of new Set(locales)) {
        if (targetLocales.has(locale)) {
          const module = graph?.getModuleById(resolvedLocaleModuleId(locale));
          if (module) graph!.invalidateModule(module, invalidated);
          dependencies.hot()?.send(dependencies.localeEvent, {
            locale,
            messages: project.localeMessages(locale),
          });
        }
      }
    },
  };
}
