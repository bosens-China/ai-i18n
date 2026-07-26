import fs from 'node:fs';
import type { LangOption, MissingTranslationFallback } from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { normalizePath } from 'vite';
import type {
  AiI18nCacheOptions,
  AiI18nLocaleLoadingOptions,
} from './options.js';
import type { NormalizedAiI18nOptions } from './project-state.js';
import type { SourceExtraction, TranslationHookBinding } from './extractor.js';

export function normalizeOptions(options: {
  sourceLang: string;
  defaultLang?: string;
  locales: readonly LangOption[];
  persist?: boolean | { key: string };
  detect?: false | 'navigator';
  fallback?: MissingTranslationFallback;
  loading?: AiI18nLocaleLoadingOptions;
  cache?: AiI18nCacheOptions;
}): NormalizedAiI18nOptions {
  const locales = options.locales.map((locale) => ({ ...locale }));
  const values = new Set(locales.map((locale) => locale.value));
  const defaultLang = options.defaultLang ?? options.sourceLang;
  if (!locales.length) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] locales 不能为空。',
        '[ai-i18n] locales must not be empty.',
      ),
    );
  }
  if (values.size !== locales.length) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] locales 中的 value 不能重复。',
        '[ai-i18n] locale values must be unique.',
      ),
    );
  }
  if (!values.has(options.sourceLang)) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] sourceLang 必须匹配 locales 中的某个 value。',
        '[ai-i18n] sourceLang must match a value in locales.',
      ),
    );
  }
  if (!values.has(defaultLang)) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] defaultLang 必须匹配 locales 中的某个 value。',
        '[ai-i18n] defaultLang must match a value in locales.',
      ),
    );
  }
  validatePositiveInteger('cache.maxMessages', options.cache?.maxMessages);
  validatePositiveInteger('cache.maxBytes', options.cache?.maxBytes);
  const persist = normalizePersist(options.persist);
  if (
    options.detect !== undefined &&
    ![false, 'navigator'].includes(options.detect)
  ) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] detect 必须是 false 或“navigator”。',
        '[ai-i18n] detect must be false or "navigator".',
      ),
    );
  }
  if (
    options.fallback !== undefined &&
    !['source', 'key', 'empty', 'marked'].includes(options.fallback)
  ) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] fallback 必须是“source”“key”“empty”或“marked”。',
        '[ai-i18n] fallback must be "source", "key", "empty", or "marked".',
      ),
    );
  }
  const loading = options.loading
    ? normalizeLoading(options.loading, values, options.sourceLang, defaultLang)
    : undefined;
  return {
    sourceLang: options.sourceLang,
    defaultLang,
    locales,
    ...(persist ? { persist } : {}),
    ...(options.detect === 'navigator' ? { detect: 'navigator' as const } : {}),
    ...(options.fallback && options.fallback !== 'source'
      ? { fallback: options.fallback }
      : {}),
    ...(loading ? { loading } : {}),
  };
}

function normalizePersist(
  persist: boolean | { key: string } | undefined,
): { key: string } | undefined {
  if (!persist) return undefined;
  if (persist === true) return { key: 'ai-i18n:lang' };
  const key = persist.key.trim();
  if (!key) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] persist.key 不能为空。',
        '[ai-i18n] persist.key must not be empty.',
      ),
    );
  }
  return { key };
}

function validatePositiveInteger(name: string, value: number | undefined) {
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new Error(
      diagnosticMessage(
        `[ai-i18n] ${name} 必须是正整数。`,
        `[ai-i18n] ${name} must be a positive integer.`,
      ),
    );
  }
}

function normalizeLoading(
  loading: AiI18nLocaleLoadingOptions,
  locales: ReadonlySet<string>,
  sourceLang: string,
  defaultLang: string,
) {
  if (loading.strategy !== 'locale') {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] loading.strategy 必须是“locale”。',
        '[ai-i18n] loading.strategy must be "locale".',
      ),
    );
  }
  const preload = new Set(loading.preload ?? []);
  const prefetch = new Set(loading.prefetch ?? []);
  if (defaultLang !== sourceLang) preload.add(defaultLang);
  for (const [kind, values] of [
    ['preload', preload],
    ['prefetch', prefetch],
  ] as const) {
    for (const locale of values) {
      if (!locales.has(locale)) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] loading.${kind} 包含未知 locale“${locale}”。`,
            `[ai-i18n] loading.${kind} contains unknown locale "${locale}".`,
          ),
        );
      }
      if (locale === sourceLang) {
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 源 locale“${locale}”不能加入 loading.${kind}。`,
            `[ai-i18n] source locale "${locale}" cannot be ${kind}ed.`,
          ),
        );
      }
    }
  }
  for (const locale of preload) {
    if (prefetch.has(locale)) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] locale“${locale}”不能同时 preload 和 prefetch。`,
          `[ai-i18n] locale "${locale}" cannot be both preloaded and prefetched.`,
        ),
      );
    }
  }
  return {
    strategy: 'locale' as const,
    preload: [...preload],
    prefetch: [...prefetch],
  };
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
  translationHooks: readonly TranslationHookBinding[] = [],
  autoImportRuntime = false,
) {
  if (!extraction && !translationHooks.length && !autoImportRuntime) {
    return undefined;
  }
  return {
    sourceCode,
    analysisLang: extraction?.analysisLang,
    mapLocation: extraction?.mapLocation,
    translationHooks,
    autoImportRuntime,
  };
}
