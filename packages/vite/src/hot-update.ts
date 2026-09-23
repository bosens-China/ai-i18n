import type {
  DevEnvironment,
  EnvironmentModuleNode,
  HotUpdateOptions,
  MinimalPluginContextWithoutEnvironment,
} from 'vite';
import type { TranslationHookBinding } from './extractor.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { DevTimingReporter } from './dev-timing.js';
import type { FileStore } from './file-store.js';
import {
  extractFrameworkSource,
  frameworkTranslationAutoImports,
  type AiI18nFramework,
} from './framework.js';
import { sourceUpdateOptions } from './plugin-utils.js';
import { isNotFound } from './json-files.js';
import { isInternalStoreFile } from './file-store-paths.js';
import type { ProjectState } from './project-state.js';
import { normalizeProjectId } from './project-paths.js';

interface HotUpdateDependencies {
  sourcePattern: RegExp;
  ready(): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  framework(): AiI18nFramework;
  autoImport(): boolean;
  translationHooks(): readonly TranslationHookBinding[];
  localeLoading: boolean;
  sendTranslationUpdates(moduleIds: readonly string[]): void;
  sendLocaleUpdates(locales: readonly string[]): void;
  requestMissingTranslations(moduleIds: readonly string[]): void;
  flushPersistence(): Promise<void>;
  runStateTask: DevStateTaskRunner;
}

type HotUpdateContext = MinimalPluginContextWithoutEnvironment & {
  environment: DevEnvironment;
};

export function wrapHotUpdate(
  handler: ReturnType<typeof createHotUpdateHandler>,
  options: {
    store(): FileStore;
    scanPending(): Promise<unknown> | undefined;
    ignores(file: string): boolean;
    root(): string | undefined;
    timing: DevTimingReporter;
  },
) {
  return async function hotUpdate(
    this: HotUpdateContext,
    update: HotUpdateOptions,
  ) {
    // 文件事件合并后再读，避免读到外部连续写入的中间状态。
    if (options.store().manages(update.file))
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    await options.scanPending()?.catch(() => undefined);
    if (options.ignores(update.file)) return [];
    const root = options.root();
    const moduleId = root
      ? (normalizeProjectId(root, update.file) ?? '<project>')
      : '<project>';
    return options.timing.measure('hot-update', moduleId, () =>
      handler.call(this, update),
    );
  };
}

export function createHotUpdateHandler(dependencies: HotUpdateDependencies) {
  return async function hotUpdate(
    this: HotUpdateContext,
    options: HotUpdateOptions,
  ): Promise<EnvironmentModuleNode[] | undefined> {
    if (this.environment.name !== 'client') return;
    await dependencies.ready();
    // 内部文件事件不进入状态队列，也不触发待写快照 flush。
    if (isInternalStoreFile(dependencies.store().directory, options.file))
      return [];
    return dependencies.runStateTask(async () => {
      await dependencies.flushPersistence();
      const project = dependencies.state();
      const fileStore = dependencies.store();
      const localeSnapshot = dependencies.localeLoading
        ? snapshotLocales(project)
        : undefined;
      if (fileStore.manages(options.file)) {
        // 排队或 flush 期间文件可能已删除；ENOENT 仍按最新磁盘状态同步，不能丢弃事件。
        if (options.type !== 'delete') {
          let content: string | undefined;
          try {
            content = await options.read();
          } catch (error) {
            if (!isNotFound(error)) throw error;
          }
          if (
            content !== undefined &&
            fileStore.isOwnWrite(options.file, content)
          )
            return [];
        }
        const loadOptions = await fileStore.loadOptions([options.file]);
        const affected = project.hydrateCache(await fileStore.load());
        affected.push(
          ...project.hydrateOverrides(await fileStore.loadOverrides()),
        );
        const reconciled = await fileStore.sync(
          project.snapshot(),
          loadOptions,
        );
        const updated = [...affected, ...project.hydrateCache(reconciled)];
        updated.push(
          ...project.hydrateOverrides(await fileStore.loadOverrides()),
        );
        if (localeSnapshot) {
          dependencies.sendLocaleUpdates(
            changedLocales(project, localeSnapshot),
          );
        } else {
          dependencies.sendTranslationUpdates(updated);
        }
        dependencies.requestMissingTranslations(updated);
        return [];
      }
      if (!dependencies.sourcePattern.test(options.file)) return;
      const moduleId = project.normalizeId(options.file);
      if (!moduleId) return;

      const code = options.type === 'delete' ? undefined : await options.read();
      const framework = dependencies.framework();
      const translationAutoImports = dependencies.autoImport()
        ? frameworkTranslationAutoImports(framework)
        : false;
      const extraction =
        code === undefined
          ? undefined
          : await extractFrameworkSource(
              code,
              options.file,
              framework,
              dependencies.autoImport(),
            );
      if (extraction === null) return;
      const affected =
        options.type === 'delete'
          ? project.remove(options.file)
          : (project.update(
              extraction?.analysisCode ?? code!,
              options.file,
              sourceUpdateOptions(
                extraction,
                code!,
                dependencies.translationHooks(),
                translationAutoImports,
              ),
            )?.affectedModuleIds ?? []);
      const cache = await fileStore.sync(project.snapshot());
      project.hydrateCache(cache);
      project.hydrateOverrides(await fileStore.loadOverrides());
      dependencies.requestMissingTranslations(affected);
      if (localeSnapshot) {
        dependencies.sendLocaleUpdates(changedLocales(project, localeSnapshot));
      } else {
        dependencies.sendTranslationUpdates(affected);
      }
      // 注册数据已经随源码模块内联；返回 undefined 让 Vite 和框架处理正常源码 HMR。
      return undefined;
    });
  };
}

function snapshotLocales(project: ProjectState): Map<string, string> {
  return new Map(
    project.options.locales
      .filter((locale) => locale.value !== project.options.sourceLang)
      .map((locale) => [
        locale.value,
        JSON.stringify(project.localeMessages(locale.value)),
      ]),
  );
}

function changedLocales(
  project: ProjectState,
  previous: ReadonlyMap<string, string>,
): string[] {
  return [...previous]
    .filter(
      ([locale, messages]) =>
        JSON.stringify(project.localeMessages(locale)) !== messages,
    )
    .map(([locale]) => locale);
}
