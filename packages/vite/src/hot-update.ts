import type {
  DevEnvironment,
  EnvironmentModuleNode,
  HotUpdateOptions,
  MinimalPluginContextWithoutEnvironment,
} from 'vite';
import type { TranslationHookBinding } from './extractor.js';
import type { FileStore } from './file-store.js';
import { extractFrameworkSource, type AiI18nFramework } from './framework.js';
import { sourceUpdateOptions } from './plugin-utils.js';
import type { ProjectState } from './project-state.js';

interface HotUpdateDependencies {
  sourcePattern: RegExp;
  resolvedRegisterPrefix: string;
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
}

type HotUpdateContext = MinimalPluginContextWithoutEnvironment & {
  environment: DevEnvironment;
};

export function createHotUpdateHandler(dependencies: HotUpdateDependencies) {
  return async function hotUpdate(
    this: HotUpdateContext,
    options: HotUpdateOptions,
  ): Promise<EnvironmentModuleNode[] | undefined> {
    if (this.environment.name !== 'client') return;
    const project = dependencies.state();
    await dependencies.ready();
    const fileStore = dependencies.store();
    const localeSnapshot = dependencies.localeLoading
      ? snapshotLocales(project)
      : undefined;
    if (fileStore.manages(options.file)) {
      const content = await options.read();
      if (fileStore.isOwnWrite(options.file, content)) return [];
      const loadOptions = fileStore.loadOptions([options.file]);
      const affected = project.hydrateCache(await fileStore.load(loadOptions));
      const reconciled = await fileStore.sync(project.snapshot(), loadOptions);
      const updated = [...affected, ...project.hydrateCache(reconciled)];
      if (localeSnapshot) {
        dependencies.sendLocaleUpdates(changedLocales(project, localeSnapshot));
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
    const extraction =
      code === undefined
        ? undefined
        : await extractFrameworkSource(code, options.file, framework);
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
              dependencies.autoImport() && framework === 'vanilla',
            ),
          )?.affectedModuleIds ?? []);
    const cache = await fileStore.sync(project.snapshot());
    project.hydrateCache(cache);
    dependencies.requestMissingTranslations(affected);
    if (localeSnapshot) {
      dependencies.sendLocaleUpdates(changedLocales(project, localeSnapshot));
    }
    const registers = affected
      .map((affectedId) =>
        this.environment.moduleGraph.getModuleById(
          `${dependencies.resolvedRegisterPrefix}${encodeURIComponent(affectedId)}`,
        ),
      )
      .filter((module) => module !== undefined);
    for (const register of registers) {
      this.environment.moduleGraph.invalidateModule(
        register,
        new Set(),
        options.timestamp,
        true,
      );
    }
    return registers.length ? [...options.modules, ...registers] : undefined;
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
