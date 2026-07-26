import { createMessageId } from './message-id.js';
import type { LangOption, TranslationValue } from './schema.js';
import { TranslationConflictError } from './schema.js';
import {
  createTemplateMessage,
  escapeTemplateLiteral,
  formatTemplateMessage,
} from './template.js';

export type ModuleMessages = Record<string, Record<string, TranslationValue>>;

export type LocaleMessages = Record<string, TranslationValue>;
export type LocaleLoader = () => Promise<LocaleMessages>;
export type MissingTranslationFallback = 'source' | 'key' | 'empty' | 'marked';

export interface Translate {
  (source: string, comment?: string): string;
  (strings: TemplateStringsArray, ...values: unknown[]): string;
}

export interface I18nRuntimeOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
  localeLoaders?: Readonly<Record<string, LocaleLoader>>;
  persist?: boolean | { key: string };
  detect?: false | 'navigator';
  fallback?: MissingTranslationFallback;
}

export interface I18nRuntime {
  t: Translate;
  translate(messageId: string, sourceFallback: string): string;
  setLang(value: string): Promise<void>;
  getLang(): string;
  getLangs(): readonly LangOption[];
  subscribe(listener: () => void): () => void;
  registerModule(moduleId: string, messages: ModuleMessages): void;
  replaceModule(moduleId: string, messages: ModuleMessages): void;
  unregisterModule(moduleId: string): void;
  replaceLocale(locale: string, messages: LocaleMessages): boolean;
}

export function createI18nRuntime(options: I18nRuntimeOptions): I18nRuntime {
  const locales = options.locales.map((locale) => ({ ...locale }));
  const localeValues = new Set(locales.map((locale) => locale.value));
  if (localeValues.size !== locales.length) {
    throw new Error('[ai-i18n] locale values must be unique');
  }
  if (!localeValues.has(options.sourceLang)) {
    throw new Error('[ai-i18n] sourceLang must exist in locales');
  }
  if (!localeValues.has(options.defaultLang)) {
    throw new Error('[ai-i18n] defaultLang must exist in locales');
  }
  if (
    options.fallback !== undefined &&
    !['source', 'key', 'empty', 'marked'].includes(options.fallback)
  ) {
    throw new Error(
      '[ai-i18n] fallback must be "source", "key", "empty", or "marked"',
    );
  }

  const listeners = new Set<() => void>();
  const localeLoaders = options.localeLoaders;
  const lazy = localeLoaders !== undefined;
  const persistenceKey = resolvePersistenceKey(options.persist);
  const initialLang =
    readPersistedLang(persistenceKey, localeValues) ??
    detectNavigatorLang(options.detect, locales) ??
    options.defaultLang;
  const loadedLocales = new Map<string, LocaleMessages>();
  const pendingLocaleUpdates = new Map<string, LocaleMessages>();
  const localeLoads = new Map<string, Promise<LocaleMessages>>();
  let modules = new Map<string, ModuleMessages>();
  let catalog = new Map<string, Map<string, TranslationValue>>();
  let currentLang = lazy ? options.sourceLang : initialLang;
  let languageRequest = 0;

  if (localeLoaders) {
    for (const locale of locales) {
      if (locale.value === options.sourceLang) {
        if (Object.hasOwn(localeLoaders, locale.value)) {
          throw new Error('[ai-i18n] source locale must not have a loader');
        }
      } else if (typeof localeLoaders[locale.value] !== 'function') {
        throw new Error(
          `[ai-i18n] target locale "${locale.value}" must have a loader`,
        );
      }
    }
    for (const locale of Object.keys(localeLoaders)) {
      if (!localeValues.has(locale)) {
        throw new Error(`[ai-i18n] unknown locale loader "${locale}"`);
      }
    }
  }

  function rebuild(nextModules: Map<string, ModuleMessages>) {
    const nextCatalog = new Map<string, Map<string, TranslationValue>>();
    for (const locale of locales) nextCatalog.set(locale.value, new Map());

    for (const [moduleId, moduleMessages] of nextModules) {
      validateModule(
        moduleId,
        moduleMessages,
        lazy ? new Set([options.sourceLang]) : localeValues,
        lazy ? 1 : locales.length,
      );
      for (const [locale, messages] of Object.entries(moduleMessages)) {
        const localeMessages = nextCatalog.get(locale)!;
        for (const [id, value] of Object.entries(messages)) {
          const previous = localeMessages.get(id);
          if (previous != null && value != null && previous !== value) {
            throw new TranslationConflictError(id, locale);
          }
          if (previous == null || value !== null) localeMessages.set(id, value);
        }
      }
    }
    for (const [locale, messages] of loadedLocales) {
      nextCatalog.set(locale, new Map(Object.entries(messages)));
    }
    modules = nextModules;
    catalog = nextCatalog;
  }

  function updateModule(moduleId: string, messages: ModuleMessages) {
    if (!moduleId) throw new Error('[ai-i18n] moduleId must not be empty');
    const nextModules = new Map(modules);
    nextModules.set(moduleId, messages);
    rebuild(nextModules);
    notify();
  }

  function notify() {
    listeners.forEach((listener) => listener());
  }

  function translate(messageId: string, sourceFallback: string) {
    const value = catalog.get(currentLang)?.get(messageId);
    if (value !== null && value !== undefined) return value;
    if (options.fallback === 'key') return messageId;
    if (options.fallback === 'empty') return '';
    if (options.fallback === 'marked') return `⟦${sourceFallback}⟧`;
    return sourceFallback;
  }

  async function loadLocale(locale: string): Promise<LocaleMessages> {
    const loaded = loadedLocales.get(locale);
    if (loaded) return loaded;
    const pending = localeLoads.get(locale);
    if (pending) return pending;
    const loader = localeLoaders?.[locale];
    if (!loader) {
      throw new Error(`[ai-i18n] locale "${locale}" cannot be loaded`);
    }
    const promise = loader()
      .then((messages) => {
        validateLocaleMessages(locale, messages);
        const current = pendingLocaleUpdates.get(locale) ?? messages;
        pendingLocaleUpdates.delete(locale);
        loadedLocales.set(locale, current);
        rebuild(modules);
        return current;
      })
      .finally(() => localeLoads.delete(locale));
    localeLoads.set(locale, promise);
    return promise;
  }

  async function changeLang(value: string, persist: boolean) {
    if (!localeValues.has(value)) {
      throw new RangeError(`[ai-i18n] unsupported locale "${value}"`);
    }
    const request = ++languageRequest;
    if (lazy && value !== options.sourceLang) await loadLocale(value);
    if (request === languageRequest) {
      const changed = value !== currentLang;
      currentLang = value;
      if (persist) writePersistedLang(persistenceKey, value);
      if (changed) notify();
    }
  }

  const t: Translate = (
    source: string | TemplateStringsArray,
    ...values: unknown[]
  ) => {
    if (typeof source === 'string') {
      const message = escapeTemplateLiteral(source);
      return formatTemplateMessage(
        translate(createMessageId(message, values[0] as string), message),
        [],
      );
    }
    const message = createTemplateMessage(source);
    return formatTemplateMessage(
      translate(createMessageId(message), message),
      values,
    );
  };

  const runtime: I18nRuntime = {
    t,
    translate,
    setLang(value) {
      return changeLang(value, true);
    },
    getLang() {
      return currentLang;
    },
    getLangs() {
      return locales;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    registerModule: updateModule,
    replaceModule: updateModule,
    unregisterModule(moduleId) {
      if (!modules.has(moduleId)) return;
      const nextModules = new Map(modules);
      nextModules.delete(moduleId);
      rebuild(nextModules);
      notify();
    },
    replaceLocale(locale, messages) {
      if (!localeValues.has(locale) || locale === options.sourceLang) {
        throw new RangeError(`[ai-i18n] unsupported target locale "${locale}"`);
      }
      validateLocaleMessages(locale, messages);
      if (!loadedLocales.has(locale)) {
        // HMR 不主动加载 locale；首次真正请求时用更新后的数据覆盖预取缓存。
        pendingLocaleUpdates.set(locale, messages);
        return false;
      }
      loadedLocales.set(locale, messages);
      rebuild(modules);
      if (currentLang === locale) notify();
      return true;
    },
  };

  if (lazy && initialLang !== options.sourceLang) {
    // 默认目标语言异步加载；失败时保持同步可用的 source fallback。
    void changeLang(initialLang, false).catch(() => {});
  }
  return runtime;
}

function resolvePersistenceKey(
  persist: I18nRuntimeOptions['persist'],
): string | undefined {
  if (!persist) return undefined;
  if (persist === true) return 'ai-i18n:lang';
  const key = persist.key.trim();
  if (!key) throw new Error('[ai-i18n] persist.key must not be empty');
  return key;
}

function readPersistedLang(
  key: string | undefined,
  locales: ReadonlySet<string>,
): string | undefined {
  if (!key) return undefined;
  try {
    const value = globalThis.localStorage?.getItem(key) ?? undefined;
    return value && locales.has(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writePersistedLang(key: string | undefined, value: string): void {
  if (!key) return;
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 隐私模式、禁用存储或配额错误不应阻断语言切换。
  }
}

function detectNavigatorLang(
  detect: I18nRuntimeOptions['detect'],
  locales: readonly LangOption[],
): string | undefined {
  if (detect !== 'navigator' || typeof navigator === 'undefined') {
    return undefined;
  }
  const requested = [...(navigator.languages ?? []), navigator.language].filter(
    Boolean,
  );
  for (const language of requested) {
    const exact = locales.find(
      (locale) => locale.value.toLowerCase() === language.toLowerCase(),
    );
    if (exact) return exact.value;
  }
  for (const language of requested) {
    const base = language.toLowerCase().split('-')[0];
    const compatible = locales.find(
      (locale) => locale.value.toLowerCase().split('-')[0] === base,
    );
    if (compatible) return compatible.value;
  }
  return undefined;
}

function validateLocaleMessages(
  locale: string,
  messages: LocaleMessages,
): void {
  for (const [id, value] of Object.entries(messages)) {
    if (typeof value !== 'string' && value !== null) {
      throw new Error(
        `[ai-i18n] locale "${locale}" message "${id}" must be a string or null`,
      );
    }
  }
}

function validateModule(
  moduleId: string,
  messages: ModuleMessages,
  locales: Set<string>,
  localeCount: number,
): void {
  const entries = Object.entries(messages);
  if (entries.length !== localeCount) {
    throw new Error(
      `[ai-i18n] module "${moduleId}" must register every locale`,
    );
  }
  for (const [locale, localeMessages] of entries) {
    if (!locales.has(locale)) {
      throw new Error(
        `[ai-i18n] module "${moduleId}" registered unknown locale "${locale}"`,
      );
    }
    for (const [id, value] of Object.entries(localeMessages)) {
      if (typeof value !== 'string' && value !== null) {
        throw new Error(
          `[ai-i18n] module "${moduleId}" message "${id}" must be a string or null`,
        );
      }
    }
  }
}
