import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  TranslationConflictError,
  type CacheFileV1,
  type CacheMessage,
  type ExtractedFileV1,
  type LangOption,
  type LocaleFileV1,
  type ModuleMessages,
  type TranslationRequest,
  type TranslationResult,
  type TranslationValue,
} from '@boses/core';
import { normalizePath } from 'vite';
import { Analyzer, analyzeModule, extractMessages } from './yuku-analyzer.js';
import type { ExtractResult, ExtractedMessage } from './yuku-analyzer.js';
import type {
  AnalysisLanguage,
  SourceLocation,
  TranslationHookBinding,
} from './extractor.js';

export interface NormalizedAiI18nOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
}

export interface ProjectUpdate {
  moduleId: string;
  result: ExtractResult;
  affectedModuleIds: string[];
}

export interface ProjectSnapshot {
  cache: CacheFileV1;
  extracted: Record<string, ExtractedFileV1>;
  locales: LocaleFileV1[];
  seen: string[];
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
    } = {},
  ): ProjectUpdate | null {
    const moduleId = this.normalizeId(id);
    if (!moduleId) return null;
    analyzeModule(code, moduleId, this.analyzer, options.analysisLang);
    this.seen.add(moduleId);
    this.fingerprints.set(
      moduleId,
      fingerprint(options.sourceCode ?? code, this.options),
    );
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
    const files: CacheFileV1['files'] = {};
    const messages: Record<string, CacheMessage> = {};
    const extracted: Record<string, ExtractedFileV1> = {};
    const localeMessages = new Map(
      this.options.locales.map((locale) => [
        locale.value,
        {} as LocaleFileV1['messages'],
      ]),
    );

    for (const [moduleId, result] of this.modules) {
      files[moduleId] = {
        fingerprint: this.fingerprints.get(moduleId) ?? '',
        messageIds: result.messages
          .map((message) => message.id)
          .sort((left, right) => left.localeCompare(right)),
      };
      if (!result.messages.length) continue;

      const extractedMessages = result.messages.map((message) => {
        const translations = this.targetTranslations(message.id);
        messages[message.id] = {
          source: message.source,
          ...(message.comment ? { comment: message.comment } : {}),
          translations,
        };
        for (const locale of this.options.locales) {
          localeMessages.get(locale.value)![message.id] =
            locale.value === this.options.sourceLang
              ? message.source
              : (translations[locale.value] ?? null);
        }
        return {
          id: message.id,
          source: message.source,
          ...(message.comment ? { comment: message.comment } : {}),
          locations: message.locations.map((location) => ({ ...location })),
          translations,
        };
      });
      extracted[moduleId] = {
        version: 1,
        source: moduleId,
        messages: extractedMessages,
      };
    }

    return {
      cache: { version: 1, files, messages },
      extracted,
      locales: this.options.locales.map((locale) => ({
        version: 1,
        locale: { ...locale },
        messages: localeMessages.get(locale.value)!,
      })),
      seen: [...this.seen].sort(),
    };
  }

  registration(moduleId: string): ModuleMessages | null {
    const result = this.modules.get(moduleId);
    if (!result?.messages.length) return null;

    return Object.fromEntries(
      this.options.locales.map((locale) => [
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

  private targetTranslations(
    messageId: string,
  ): Record<string, TranslationValue> {
    return Object.fromEntries(
      this.options.locales
        .filter((locale) => locale.value !== this.options.sourceLang)
        .map((locale) => [
          locale.value,
          this.translations.get(locale.value)?.get(messageId) ?? null,
        ]),
    );
  }
}

const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:\//;

function mapResultLocations(
  result: ExtractResult,
  mapLocation: (location: SourceLocation) => SourceLocation,
): ExtractResult {
  return {
    ...result,
    messages: result.messages.map((message) => ({
      ...message,
      locations: message.locations.map(mapLocation),
    })),
    warnings: result.warnings.map((warning) => ({
      ...warning,
      ...mapLocation(warning),
    })),
  };
}

function resolutionKey(importer: string, specifier: string) {
  return `${importer}\0${specifier}`;
}

function fingerprint(code: string, options: NormalizedAiI18nOptions): string {
  // fingerprint 同时覆盖源码、schema/extractor 版本和语言配置。
  const config = JSON.stringify({
    version: 1,
    extractor: 'yuku-0.7.3',
    sourceLang: options.sourceLang,
    locales: options.locales.map((locale) => locale.value),
  });
  return `sha256:${createHash('sha256').update(config).update('\0').update(code).digest('hex')}`;
}
