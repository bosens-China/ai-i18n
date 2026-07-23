import fs from 'node:fs';
import type { LangOption } from '@ai-i18n/core';
import { normalizePath } from 'vite';
import type { NormalizedAiI18nOptions } from './project-state.js';
import type {
  SourceExtraction,
  SourceExtractor,
  TranslationHookBinding,
} from './extractor.js';

export function normalizeOptions(options: {
  sourceLang: string;
  defaultLang?: string;
  locales: readonly LangOption[];
}): NormalizedAiI18nOptions {
  const locales = options.locales.map((locale) => ({ ...locale }));
  const values = new Set(locales.map((locale) => locale.value));
  const defaultLang = options.defaultLang ?? options.sourceLang;
  if (!locales.length) throw new Error('[ai-i18n] locales must not be empty');
  if (values.size !== locales.length) {
    throw new Error('[ai-i18n] locale values must be unique');
  }
  if (!values.has(options.sourceLang)) {
    throw new Error('[ai-i18n] sourceLang must exist in locales');
  }
  if (!values.has(defaultLang)) {
    throw new Error('[ai-i18n] defaultLang must exist in locales');
  }
  return { sourceLang: options.sourceLang, defaultLang, locales };
}

export function normalizeRoot(root: string): string {
  try {
    return normalizePath(fs.realpathSync.native(root));
  } catch {
    return normalizePath(root);
  }
}

export function registrationImportOffset(
  code: string,
  body: ReadonlyArray<{ type: string; end: number; expression?: unknown }>,
): number {
  let offset = code.startsWith('#!') ? code.indexOf('\n') + 1 : 0;
  for (const node of body) {
    if (
      node.type !== 'ExpressionStatement' ||
      !node.expression ||
      typeof node.expression !== 'object' ||
      !('type' in node.expression) ||
      node.expression.type !== 'Literal' ||
      !('value' in node.expression) ||
      typeof node.expression.value !== 'string'
    ) {
      break;
    }
    offset = node.end;
  }
  for (const node of body) {
    if (node.type === 'ImportDeclaration') offset = Math.max(offset, node.end);
  }
  return offset;
}

export function extractSource(
  code: string,
  id: string,
  extractors: readonly SourceExtractor[],
  isDefaultSource: boolean,
): SourceExtraction | null | undefined {
  const extractor = extractors.find((candidate) => candidate.test(id));
  if (extractor) return extractor.extract(code, id);
  return isDefaultSource ? undefined : null;
}

export function shouldIgnoreSource(id: string): boolean {
  const query = id.includes('?')
    ? new URLSearchParams(id.slice(id.indexOf('?') + 1))
    : null;
  const isVueSubmodule = Boolean(query?.has('vue') && query.has('type'));
  const isExternalVueScript =
    isVueSubmodule &&
    query?.get('type') === 'script' &&
    query.get('src') === 'true';
  return (
    id.includes('/node_modules/') ||
    id.includes('?html-proxy') ||
    (isVueSubmodule && !isExternalVueScript)
  );
}

export function sourceUpdateOptions(
  extraction: SourceExtraction | undefined,
  sourceCode: string,
  globalTranslationHooks: readonly TranslationHookBinding[] = [],
) {
  const translationHooks = [
    ...globalTranslationHooks,
    ...(extraction?.translationHooks ?? []),
  ];
  if (!extraction && !translationHooks.length) return undefined;
  return {
    sourceCode,
    analysisLang: extraction?.analysisLang,
    mapLocation: extraction?.mapLocation,
    translationHooks,
  };
}
