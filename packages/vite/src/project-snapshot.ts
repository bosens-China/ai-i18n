import { createHash } from 'node:crypto';
import type {
  CacheFileV2,
  CacheMessage,
  ExtractedFileV1,
  LocaleFileV1,
  TranslationValue,
} from '@ai-i18n/core';
import type { ExtractResult } from './yuku-analyzer.js';
import type { SourceLocation } from './extractor.js';
import type { NormalizedAiI18nOptions } from './project-state.js';

export interface ProjectSnapshot {
  cache: CacheFileV2;
  extracted: Record<string, ExtractedFileV1>;
  locales: LocaleFileV1[];
  seen: string[];
}

export function createProjectSnapshot(
  modules: ReadonlyMap<string, ExtractResult>,
  translations: ReadonlyMap<string, ReadonlyMap<string, TranslationValue>>,
  seen: ReadonlySet<string>,
  options: NormalizedAiI18nOptions,
): ProjectSnapshot {
  const messages: Record<string, CacheMessage> = {};
  const extracted: Record<string, ExtractedFileV1> = {};
  const targetLocales = options.locales.filter(
    (locale) => locale.value !== options.sourceLang,
  );
  const localeMessages = new Map(
    targetLocales.map((locale) => [
      locale.value,
      {} as LocaleFileV1['messages'],
    ]),
  );

  for (const [moduleId, result] of modules) {
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
        sourceLang: options.sourceLang,
        ...(message.comment ? { comment: message.comment } : {}),
        translations: targetTranslations,
      };
      for (const locale of targetLocales) {
        localeMessages.get(locale.value)![message.id] =
          targetTranslations[locale.value] ?? null;
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
    cache: { version: 2, messages },
    extracted,
    locales: targetLocales.map((locale) => ({
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
