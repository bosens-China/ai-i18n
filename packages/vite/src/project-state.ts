import type { ModuleMessages, TranslationValue } from '@ai-i18n/core';
import type { TranslationAutoImports } from '@ai-i18n/analyzer';
import { Analyzer, analyzeModule, extractMessages } from './yuku-analyzer.js';
import type { ExtractResult, ExtractedMessage } from './yuku-analyzer.js';
import type { SourceLocation, TranslationHookBinding } from './extractor.js';
import {
  createProjectSnapshot,
  fingerprint,
  mapResultLocations,
  type ProjectSnapshot,
} from './project-snapshot.js';
import type {
  NormalizedAiI18nOptions,
  ProjectUpdate,
  ProjectStateUpdateOptions,
} from './project-state-types.js';
import { normalizeProjectId, resolutionKey } from './project-paths.js';
import { fileId, fileMessageKey } from './repository-paths.js';
import path from 'node:path';
import {
  registrationLoadFiles,
  registrationWatchFiles,
} from './project-registration-files.js';

export type { ProjectSnapshot } from './project-snapshot.js';
export type {
  NormalizedAiI18nOptions,
  ProjectUpdate,
} from './project-state-types.js';

export class ProjectState {
  readonly analyzer: Analyzer;
  readonly modules = new Map<string, ExtractResult>();
  readonly seen = new Set<string>();
  private readonly resolutions = new Map<string, string>();
  private readonly fingerprints = new Map<string, string>();
  private readonly locationMappers = new Map<
    string,
    (location: SourceLocation) => SourceLocation
  >();
  private readonly translationHooks = new Map<
    string,
    readonly TranslationHookBinding[]
  >();
  private readonly autoImportRuntime = new Map<
    string,
    TranslationAutoImports
  >();
  private readonly repositoryLocales = new Map<
    string,
    Record<string, string>
  >();

  constructor(
    readonly root: string,
    readonly options: NormalizedAiI18nOptions,
    public deferAnalysis = false,
  ) {
    this.analyzer = new Analyzer({
      resolve: (specifier, importer) =>
        this.resolutions.get(resolutionKey(importer, specifier)) ?? null,
    });
  }

  normalizeId(id: string): string | null {
    return normalizeProjectId(this.root, id);
  }

  update(
    code: string,
    id: string,
    options: ProjectStateUpdateOptions = {},
  ): ProjectUpdate | null {
    const moduleId = this.normalizeId(id);
    if (!moduleId) return null;
    const nextFingerprint = fingerprint(
      options.sourceCode ?? code,
      this.options,
    );
    const current = this.modules.get(moduleId);
    if (
      !options.force &&
      current &&
      this.fingerprints.get(moduleId) === nextFingerprint
    ) {
      // Rolldown 可能因虚拟注册模块失效而重新调用 transform；源码未变时复用 AST。
      return { moduleId, result: current, affectedModuleIds: [] };
    }
    analyzeModule(code, moduleId, this.analyzer, options.analysisLang);
    this.seen.add(moduleId);
    this.fingerprints.set(moduleId, nextFingerprint);
    if (options.mapLocation) {
      this.locationMappers.set(moduleId, options.mapLocation);
    } else {
      this.locationMappers.delete(moduleId);
    }
    if (options.translationHooks?.length) {
      this.translationHooks.set(moduleId, options.translationHooks);
    } else {
      this.translationHooks.delete(moduleId);
    }
    if (options.autoImportRuntime) {
      this.autoImportRuntime.set(moduleId, options.autoImportRuntime);
    } else {
      this.autoImportRuntime.delete(moduleId);
    }
    if (this.deferAnalysis) {
      const result = {
        messages: [],
        warnings: [],
        dependencies: [],
        pending: false,
      };
      this.modules.set(moduleId, result);
      return { moduleId, result, affectedModuleIds: [] };
    }
    const affectedModuleIds = this.refresh([moduleId]);
    return {
      moduleId,
      result: this.modules.get(moduleId)!,
      affectedModuleIds,
    };
  }

  updateExtracted(
    code: string,
    id: string,
    messages: ExtractedMessage[],
  ): ProjectUpdate | null {
    const moduleId = this.normalizeId(id);
    if (!moduleId) return null;
    const result: ExtractResult = {
      messages,
      warnings: [],
      dependencies: [],
      pending: false,
    };
    this.modules.set(moduleId, result);
    this.seen.add(moduleId);
    this.fingerprints.set(moduleId, fingerprint(code, this.options));
    return { moduleId, result, affectedModuleIds: [moduleId] };
  }

  remove(id: string): string[] {
    const moduleId = this.normalizeId(id);
    if (!moduleId) return [];
    this.analyzer.link();
    const dependents = [
      ...(this.analyzer.module(moduleId)?.dependents ?? []),
    ].map((module) => module.path);
    this.analyzer.removeFile(moduleId);
    this.modules.delete(moduleId);
    this.seen.delete(moduleId);
    this.fingerprints.delete(moduleId);
    this.locationMappers.delete(moduleId);
    this.translationHooks.delete(moduleId);
    this.autoImportRuntime.delete(moduleId);
    const affected = this.refresh(dependents);
    return [...new Set([moduleId, ...affected])];
  }

  retain(ids: Iterable<string>): string[] {
    const active = new Set<string>();
    for (const id of ids) {
      const moduleId = this.normalizeId(id);
      if (moduleId) active.add(moduleId);
    }
    const affected = [...this.modules.keys()]
      .filter((moduleId) => !active.has(moduleId))
      .flatMap((moduleId) => this.remove(moduleId));
    return [...new Set(affected)];
  }

  registrationWatchFiles(moduleId: string): string[] {
    return registrationWatchFiles(this.analyzer, this.root, moduleId);
  }

  registrationLoadFiles(moduleId: string): string[] {
    return registrationLoadFiles(this.modules, this.root, moduleId);
  }

  setResolution(
    importer: string,
    specifier: string,
    resolvedId: string,
  ): boolean {
    const importerId = this.normalizeId(importer);
    const targetId = this.normalizeId(resolvedId);
    if (!importerId || !targetId) return false;
    const key = resolutionKey(importerId, specifier);
    if (this.resolutions.get(key) === targetId) return false;
    this.resolutions.set(key, targetId);
    return true;
  }

  reset(): void {
    for (const moduleId of this.analyzer.modules.keys()) {
      this.analyzer.removeFile(moduleId);
    }
    this.modules.clear();
    this.seen.clear();
    this.resolutions.clear();
    this.fingerprints.clear();
    this.locationMappers.clear();
    this.translationHooks.clear();
    this.autoImportRuntime.clear();
    this.repositoryLocales.clear();
  }

  setRepositoryLocale(locale: string, messages: Record<string, string>): void {
    this.repositoryLocales.set(locale, { ...messages });
  }

  snapshot(): ProjectSnapshot {
    return createProjectSnapshot(this.modules, this.seen);
  }

  registration(moduleId: string, localeValue?: string): ModuleMessages | null {
    const result = this.modules.get(moduleId);
    if (!result?.messages.length) return null;
    const id = fileId(this.root, path.resolve(this.root, moduleId));
    return Object.fromEntries(
      this.options.locales
        .filter((locale) => !localeValue || locale.value === localeValue)
        .map((locale) => {
          const catalog = this.repositoryLocales.get(locale.value) ?? {};
          return [
            locale.value,
            Object.fromEntries(
              result.messages.map((message) => {
                const key =
                  message.scope === 'file'
                    ? fileMessageKey(id, message.id)
                    : message.id;
                const ownValue = Object.hasOwn(catalog, key)
                  ? catalog[key]
                  : undefined;
                const globalValue =
                  message.scope === 'file' && Object.hasOwn(catalog, message.id)
                    ? catalog[message.id]
                    : undefined;
                const value =
                  locale.value === this.options.sourceLang
                    ? message.source
                    : (ownValue ?? globalValue ?? null);
                return [key, value];
              }),
            ),
          ];
        }),
    );
  }

  localeMessages(locale: string): Record<string, TranslationValue> {
    return this.repositoryLocales.get(locale) ?? {};
  }

  /** 扫描收齐入口依赖后一次关联、提取；完成后恢复 Dev 的即时更新。 */
  finishAnalysis(): void {
    this.deferAnalysis = false;
    this.refresh(this.analyzer.modules.keys());
  }

  private refresh(moduleIds: Iterable<string>): string[] {
    this.analyzer.link();
    const affected: string[] = [];
    const queue = [...moduleIds];
    const visited = new Set<string>();
    while (queue.length) {
      const moduleId = queue.shift()!;
      if (visited.has(moduleId)) continue;
      visited.add(moduleId);
      const module = this.analyzer.module(moduleId);
      if (!module) continue;
      const result = extractMessages(
        module,
        undefined,
        this.translationHooks.get(moduleId),
        this.autoImportRuntime.get(moduleId) ?? false,
      );
      const mapLocation = this.locationMappers.get(moduleId);
      this.modules.set(
        moduleId,
        mapLocation ? mapResultLocations(result, mapLocation) : result,
      );
      affected.push(moduleId);
      queue.push(...module.dependents.map((dependent) => dependent.path));
    }
    return affected;
  }
}
