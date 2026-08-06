import {
  type ModuleMessages,
  type TranslationMemoryFile,
  type TranslationOverridesFile,
  type TranslationValue,
  resolveTranslationOverride,
} from '@ai-i18n/core';
import {
  diagnosticMessage,
  type TranslationAutoImports,
} from '@ai-i18n/analyzer';
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
import type {
  NormalizedAiI18nOptions,
  ProjectUpdate,
} from './project-state-types.js';
import {
  changedEffectiveModules,
  snapshotEffectiveModules,
} from './translation-overrides.js';
import type { ProviderResult } from './provider-coordinator.js';
import type { ProviderRequest } from './provider-coordinator.js';
import { ProviderTranslationState } from './provider-translation-state.js';
import { normalizeProjectId, resolutionKey } from './project-paths.js';
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
  private readonly translations = new Map<
    string,
    Map<string, TranslationValue>
  >();
  private overrides: TranslationOverridesFile = {
    version: 1,
    messages: {},
  };
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
  private readonly providerTranslations = new ProviderTranslationState();

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
    return normalizeProjectId(this.root, id);
  }

  update(
    code: string,
    id: string,
    options: {
      sourceCode?: string;
      analysisLang?: AnalysisLanguage;
      mapLocation?: (location: SourceLocation) => SourceLocation;
      translationHooks?: readonly TranslationHookBinding[];
      autoImportRuntime?: TranslationAutoImports;
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
    if (options.autoImportRuntime) {
      this.autoImportRuntime.set(moduleId, options.autoImportRuntime);
    } else {
      this.autoImportRuntime.delete(moduleId);
    }
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
    this.translations.clear();
    this.overrides = { version: 1, messages: {} };
    this.fingerprints.clear();
    this.locationMappers.clear();
    this.translationHooks.clear();
    this.autoImportRuntime.clear();
    this.providerTranslations.reset();
  }

  hydrateCache(cache: TranslationMemoryFile): string[] {
    const previous = this.effectiveModules();
    const nextTranslations = new Map<string, Map<string, TranslationValue>>();
    for (const [messageId, message] of Object.entries(cache.messages)) {
      for (const [locale, value] of Object.entries(message.translations)) {
        const translations = nextTranslations.get(locale) ?? new Map();
        translations.set(messageId, value);
        nextTranslations.set(locale, translations);
      }
    }
    this.translations.clear();
    for (const [locale, translations] of nextTranslations) {
      this.translations.set(locale, translations);
    }
    return changedEffectiveModules(previous, this.effectiveModules());
  }

  hydrateOverrides(overrides: TranslationOverridesFile): string[] {
    const previous = this.effectiveModules();
    this.overrides = structuredClone(overrides);
    return changedEffectiveModules(previous, this.effectiveModules());
  }

  missingTranslations(
    moduleId: string,
    options: { refreshCached?: boolean } = {},
  ): ProviderRequest[] {
    const result = this.modules.get(moduleId);
    if (!result) return [];
    return this.providerTranslations.requests({
      messages: result.messages,
      locales: this.options.locales,
      sourceLang: this.options.sourceLang,
      overrides: this.overrides,
      refreshCached: options.refreshCached ?? false,
      cachedTranslation: (messageId, locale) =>
        this.cachedTranslation(messageId, locale),
    });
  }

  applyTranslations(
    results: readonly ProviderResult[],
    options: { replaceCached?: boolean } = {},
  ): string[] {
    const previous = this.effectiveModules();
    for (const result of results) {
      const translations = this.translations.get(result.locale) ?? new Map();
      const current = translations.get(result.messageId) ?? null;
      if (
        !this.providerTranslations.shouldApply(
          result,
          current,
          options.replaceCached ?? false,
        )
      ) {
        continue;
      }
      translations.set(result.messageId, result.value);
      this.translations.set(result.locale, translations);
    }
    return changedEffectiveModules(previous, this.effectiveModules());
  }

  snapshot(): ProjectSnapshot {
    return createProjectSnapshot(
      this.modules,
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
              : this.translation(message, locale.value),
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
      throw new RangeError(
        diagnosticMessage(
          `[ai-i18n] 不支持目标 locale“${locale}”。`,
          `[ai-i18n] Unsupported target locale "${locale}".`,
        ),
      );
    }
    return Object.fromEntries(
      [...this.modules.values()].flatMap((result) =>
        result.messages.map((message) => [
          message.id,
          this.translation(message, locale),
        ]),
      ),
    );
  }

  private translation(
    message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
    locale: string,
  ): TranslationValue {
    return (
      resolveTranslationOverride(this.overrides, message, locale) ??
      this.cachedTranslation(message.id, locale)
    );
  }

  private cachedTranslation(messageId: string, locale: string) {
    return this.translations.get(locale)?.get(messageId) ?? null;
  }

  private effectiveModules(): Map<string, string> {
    return snapshotEffectiveModules(
      this.modules,
      this.options.locales,
      this.options.sourceLang,
      (message, locale) => this.translation(message, locale),
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
