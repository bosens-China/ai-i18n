import path from 'node:path';
import {
  TranslationConflictError,
  type CacheFileV1,
  type LangOption,
  type ModuleMessages,
  type TranslationRequest,
  type TranslationResult,
  type TranslationValue,
} from '@ai-i18n/core';
import { normalizePath } from 'vite';
import { Analyzer, analyzeModule, extractMessages } from './yuku-analyzer.js';
import type { ExtractResult, ExtractedMessage } from './yuku-analyzer.js';
import type {
  AnalysisLanguage,
  SourceLocation,
  TranslationHookBinding,
} from './extractor.js';
import {
  createProjectSnapshot,
  fingerprint,
  mapResultLocations,
  type ProjectSnapshot,
} from './project-snapshot.js';

export type { ProjectSnapshot } from './project-snapshot.js';

export interface NormalizedAiI18nOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
  loading?: {
    strategy: 'locale';
    preload: readonly string[];
    prefetch: readonly string[];
  };
}

export interface ProjectUpdate {
  moduleId: string;
  result: ExtractResult;
  affectedModuleIds: string[];
}

export class ProjectState {
  readonly analyzer: Analyzer;
  readonly modules = new Map<string, ExtractResult>();
  readonly seen = new Set<string>();
  private readonly resolutions = new Map<string, string>();
  private readonly translations = new Map<
    string,
    Map<string, TranslationValue>
  >();
  private readonly fingerprints = new Map<string, string>();
  private readonly locationMappers = new Map<
    string,
    (location: SourceLocation) => SourceLocation
  >();
  private readonly translationHooks = new Map<
    string,
    readonly TranslationHookBinding[]
  >();
  private readonly autoImportRuntime = new Set<string>();

  constructor(
    readonly root: string,
    readonly options: NormalizedAiI18nOptions,
  ) {
    this.analyzer = new Analyzer({
      resolve: (specifier, importer) =>
        this.resolutions.get(resolutionKey(importer, specifier)) ?? null,
    });
  }

  normalizeId(id: string): string | null {
    const cleanId = normalizePath(id.split('?')[0]!.replaceAll('\\', '/'));
    if (cleanId.includes('/node_modules/') || cleanId.startsWith('\0'))
      return null;
    const cleanRoot = normalizePath(this.root.replaceAll('\\', '/'));
    if (WINDOWS_ABSOLUTE_RE.test(cleanId)) {
      const relative = path.posix.relative(cleanRoot, cleanId);
      return relative.startsWith('../') ? null : relative;
    }
    if (!path.isAbsolute(cleanId)) return cleanId;
    const relative = normalizePath(path.relative(cleanRoot, cleanId));
    return relative.startsWith('../') ? null : relative;
  }

  update(
    code: string,
    id: string,
    options: {
      sourceCode?: string;
      analysisLang?: AnalysisLanguage;
      mapLocation?: (location: SourceLocation) => SourceLocation;
      translationHooks?: readonly TranslationHookBinding[];
      autoImportRuntime?: boolean;
      force?: boolean;
    } = {},
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
    if (options.autoImportRuntime) this.autoImportRuntime.add(moduleId);
    else this.autoImportRuntime.delete(moduleId);
    const affectedModuleIds = this.refresh(moduleId);
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
    const result: ExtractResult = { messages, warnings: [], pending: false };
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
    const affected = dependents.flatMap((dependent) => this.refresh(dependent));
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
    this.analyzer.link();
    const queue = [moduleId];
    const watched = new Set<string>();
    while (queue.length) {
      const currentId = queue.shift()!;
      if (watched.has(currentId)) continue;
      watched.add(currentId);
      const current = this.analyzer.module(currentId);
      if (current) {
        queue.push(
          ...current.dependencies.map((dependency) => dependency.path),
        );
      }
    }
    return [...watched].map((source) => path.resolve(this.root, source));
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
    this.translations.clear();
    this.fingerprints.clear();
    this.locationMappers.clear();
    this.translationHooks.clear();
    this.autoImportRuntime.clear();
  }

  hydrateCache(cache: CacheFileV1): string[] {
    const changedIds = new Set<string>();
    const nextTranslations = new Map<string, Map<string, TranslationValue>>();
    for (const [messageId, message] of Object.entries(cache.messages)) {
      for (const [locale, value] of Object.entries(message.translations)) {
        const translations = nextTranslations.get(locale) ?? new Map();
        translations.set(messageId, value);
        nextTranslations.set(locale, translations);
        if (this.translations.get(locale)?.get(messageId) !== value) {
          changedIds.add(messageId);
        }
      }
    }
    // cache 是磁盘真相；被 orphan 清理删除的翻译也必须从进程状态移除。
    for (const [locale, translations] of this.translations) {
      for (const messageId of translations.keys()) {
        if (!nextTranslations.get(locale)?.has(messageId)) {
          changedIds.add(messageId);
        }
      }
    }
    this.translations.clear();
    for (const [locale, translations] of nextTranslations) {
      this.translations.set(locale, translations);
    }
    return [...this.modules]
      .filter(([, module]) =>
        module.messages.some((message) => changedIds.has(message.id)),
      )
      .map(([moduleId]) => moduleId);
  }

  missingTranslations(moduleId: string): TranslationRequest[] {
    const result = this.modules.get(moduleId);
    if (!result) return [];
    return result.messages.flatMap((message) =>
      this.options.locales
        .filter(
          (locale) =>
            locale.value !== this.options.sourceLang &&
            (this.translations.get(locale.value)?.get(message.id) ?? null) ===
              null,
        )
        .map((locale) => ({
          messageId: message.id,
          source: message.source,
          ...(message.comment ? { comment: message.comment } : {}),
          locale: locale.value,
        })),
    );
  }

  applyTranslations(results: readonly TranslationResult[]): string[] {
    const changedIds = new Set<string>();
    for (const result of results) {
      const translations = this.translations.get(result.locale) ?? new Map();
      const current = translations.get(result.messageId);
      if (current != null && result.value != null && current !== result.value) {
        throw new TranslationConflictError(result.messageId, result.locale);
      }
      if (result.value === null || current === result.value) continue;
      translations.set(result.messageId, result.value);
      this.translations.set(result.locale, translations);
      changedIds.add(result.messageId);
    }

    if (!changedIds.size) return [];
    return [...this.modules]
      .filter(([, module]) =>
        module.messages.some((message) => changedIds.has(message.id)),
      )
      .map(([moduleId]) => moduleId);
  }

  snapshot(): ProjectSnapshot {
    return createProjectSnapshot(
      this.modules,
      this.fingerprints,
      this.translations,
      this.seen,
      this.options,
    );
  }

  registration(moduleId: string, localeValue?: string): ModuleMessages | null {
    const result = this.modules.get(moduleId);
    if (!result?.messages.length) return null;
    const locales = localeValue
      ? this.options.locales.filter((locale) => locale.value === localeValue)
      : this.options.locales;

    return Object.fromEntries(
      locales.map((locale) => [
        locale.value,
        Object.fromEntries(
          result.messages.map((message) => [
            message.id,
            locale.value === this.options.sourceLang
              ? message.source
              : (this.translations.get(locale.value)?.get(message.id) ?? null),
          ]),
        ),
      ]),
    );
  }

  localeMessages(locale: string): Record<string, TranslationValue> {
    if (
      locale === this.options.sourceLang ||
      !this.options.locales.some((option) => option.value === locale)
    ) {
      throw new RangeError(`[ai-i18n] unsupported target locale "${locale}"`);
    }
    return Object.fromEntries(
      [...this.modules.values()].flatMap((result) =>
        result.messages.map((message) => [
          message.id,
          this.translations.get(locale)?.get(message.id) ?? null,
        ]),
      ),
    );
  }

  private refresh(startModuleId: string): string[] {
    this.analyzer.link();
    const affected: string[] = [];
    const queue = [startModuleId];
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
        this.autoImportRuntime.has(moduleId),
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

const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:\//;

function resolutionKey(importer: string, specifier: string) {
  return `${importer}\0${specifier}`;
}
