import { createHash } from 'node:crypto';
import type {
  CacheFileV1,
  CacheMessage,
  ExtractedFileV1,
  LocaleFileV1,
  TranslationValue,
} from '@ai-i18n/core';
import type { ExtractResult } from './yuku-analyzer.js';
import type { SourceLocation } from './extractor.js';
import type { NormalizedAiI18nOptions } from './project-state.js';

export interface ProjectSnapshot {
  cache: CacheFileV1;
  extracted: Record<string, ExtractedFileV1>;
  locales: LocaleFileV1[];
  seen: string[];
}

export function createProjectSnapshot(
  modules: ReadonlyMap<string, ExtractResult>,
  fingerprints: ReadonlyMap<string, string>,
  translations: ReadonlyMap<string, ReadonlyMap<string, TranslationValue>>,
  seen: ReadonlySet<string>,
  options: NormalizedAiI18nOptions,
): ProjectSnapshot {
  const files: CacheFileV1['files'] = {};
  const messages: Record<string, CacheMessage> = {};
  const extracted: Record<string, ExtractedFileV1> = {};
  const localeMessages = new Map(
    options.locales.map((locale) => [
      locale.value,
      {} as LocaleFileV1['messages'],
    ]),
  );

  for (const [moduleId, result] of modules) {
    files[moduleId] = {
      fingerprint: fingerprints.get(moduleId) ?? '',
      messageIds: result.messages
        .map((message) => message.id)
        .sort((left, right) => left.localeCompare(right)),
    };
    if (!result.messages.length) continue;

    const extractedMessages = result.messages.map((message) => {
      const targetTranslations = Object.fromEntries(
        options.locales
          .filter((locale) => locale.value !== options.sourceLang)
          .map((locale) => [
            locale.value,
            translations.get(locale.value)?.get(message.id) ?? null,
          ]),
      );
      messages[message.id] = {
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        translations: targetTranslations,
      };
      for (const locale of options.locales) {
        localeMessages.get(locale.value)![message.id] =
          locale.value === options.sourceLang
            ? message.source
            : (targetTranslations[locale.value] ?? null);
      }
      return {
        id: message.id,
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        locations: message.locations.map((location) => ({ ...location })),
        translations: targetTranslations,
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
    locales: options.locales.map((locale) => ({
      version: 1,
      locale: { ...locale },
      messages: localeMessages.get(locale.value)!,
    })),
    seen: [...seen].sort(),
  };
}

export function mapResultLocations(
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

export function fingerprint(
  code: string,
  options: NormalizedAiI18nOptions,
): string {
  // fingerprint 同时覆盖源码、schema/extractor 版本和语言配置。
  const config = JSON.stringify({
    version: 1,
    extractor: 'yuku-0.7.3',
    sourceLang: options.sourceLang,
    locales: options.locales.map((locale) => locale.value),
  });
  return `sha256:${createHash('sha256').update(config).update('\0').update(code).digest('hex')}`;
}
