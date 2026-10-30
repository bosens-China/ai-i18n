import type {
  CacheMessage,
  ExtractedMessage,
  TranslationOverridesFile,
  TranslationValue,
  TranslationMemoryFile,
} from '@ai-i18n/core';
import { resolveTranslationOverride } from '@ai-i18n/core';
import type { SourceLocation } from './extractor.js';
import type { ProjectState } from './project-state.js';

export function remoteTranslationValue(
  remote: TranslationMemoryFile | undefined,
  id: string,
  locale: string,
): TranslationValue {
  return remote && Object.hasOwn(remote.messages, id)
    ? (remote.messages[id]?.translations[locale] ?? null)
    : null;
}

export function effectiveModuleSignatures(
  project: Pick<ProjectState, 'modules' | 'registration'>,
): Map<string, string> {
  // 与浏览器实际注册数据共用出现位置解析，避免位置校对变化漏发 HMR。
  return new Map(
    [...project.modules.keys()].map((id) => [
      id,
      JSON.stringify(project.registration(id)),
    ]),
  );
}

export function resolveEffectiveTranslation(
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
  overrides: TranslationOverridesFile,
  automatic: TranslationValue,
  sourceFile?: string,
  occurrence?: SourceLocation,
  remoteOverlay?: TranslationMemoryFile,
): TranslationValue {
  // 远程覆盖层独立于本地事实；null 撤销覆盖，空字符串仍然有效。
  const remote = remoteTranslationValue(remoteOverlay, message.id, locale);
  return (
    remote ??
    resolveTranslationOverride(
      overrides,
      message,
      locale,
      sourceFile,
      occurrence,
    ) ??
    automatic
  );
}

export function effectiveTranslation(
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
  cacheMessages: Readonly<Record<string, CacheMessage>>,
  overrides: TranslationOverridesFile,
  sourceFile?: string,
  remoteOverlay?: TranslationMemoryFile,
): TranslationValue {
  return resolveEffectiveTranslation(
    message,
    locale,
    overrides,
    (Object.hasOwn(cacheMessages, message.id)
      ? cacheMessages[message.id]?.translations[locale]
      : undefined) ?? null,
    sourceFile,
    undefined,
    remoteOverlay,
  );
}

export function changedEffectiveModules(
  previous: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): string[] {
  return [...new Set([...previous.keys(), ...current.keys()])].filter(
    (moduleId) => previous.get(moduleId) !== current.get(moduleId),
  );
}
