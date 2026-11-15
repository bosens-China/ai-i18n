import { createHash } from 'node:crypto';
import type { ExtractedFile } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { ExtractResult } from './yuku-analyzer.js';
import type { SourceLocation } from './extractor.js';
import type { NormalizedAiI18nOptions } from './project-state.js';

export interface ProjectSnapshot {
  extracted: Record<string, ExtractedFile>;
  seen: string[];
}

export function createProjectSnapshot(
  modules: ReadonlyMap<string, ExtractResult>,
  seen: ReadonlySet<string>,
): ProjectSnapshot {
  const messageSources = new Map<string, string>();
  const extracted: Record<string, ExtractedFile> = {};
  for (const [moduleId, result] of modules) {
    if (!result.messages.length) continue;

    const extractedMessages = result.messages.map((message) => {
      const previousSource = messageSources.get(message.id);
      if (previousSource !== undefined && previousSource !== message.source) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 消息 ID“${message.id}”同时用于“${previousSource}”和“${message.source}”。`,
            `[ai-i18n] Message ID "${message.id}" is used by both "${previousSource}" and "${message.source}".`,
          ),
        );
      }
      messageSources.set(message.id, message.source);
      return {
        id: message.id,
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
        ...(message.scope === 'file' ? { scope: 'file' as const } : {}),
        locations: message.locations.map((location) => ({ ...location })),
      };
    });
    extracted[moduleId] = {
      version: 1,
      source: moduleId,
      messages: extractedMessages,
    };
  }

  return {
    extracted,
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
