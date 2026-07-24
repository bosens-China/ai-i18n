import { createMessageId } from './message-id.js';
import type { LangOption, TranslationValue } from './schema.js';
import { TranslationConflictError } from './schema.js';

export type ModuleMessages = Record<string, Record<string, TranslationValue>>;

export type LocaleMessages = Record<string, TranslationValue>;
export type LocaleLoader = () => Promise<LocaleMessages>;

export interface I18nRuntimeOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
  localeLoaders?: Readonly<Record<string, LocaleLoader>>;
}

export interface I18nRuntime {
  t(source: string, comment?: string): string;
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

  const listeners = new Set<() => void>();
  const localeLoaders = options.localeLoaders;
  const lazy = localeLoaders !== undefined;
  const loadedLocales = new Map<string, LocaleMessages>();
  const pendingLocaleUpdates = new Map<string, LocaleMessages>();
  const localeLoads = new Map<string, Promise<LocaleMessages>>();
  let modules = new Map<string, ModuleMessages>();
  let catalog = new Map<string, Map<string, TranslationValue>>();
  let currentLang = lazy ? options.sourceLang : options.defaultLang;
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
    return value === null || value === undefined ? sourceFallback : value;
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

  async function setLang(value: string) {
    if (!localeValues.has(value)) {
      throw new RangeError(`[ai-i18n] unsupported locale "${value}"`);
    }
    const request = ++languageRequest;
    if (lazy && value !== options.sourceLang) await loadLocale(value);
    if (request === languageRequest && value !== currentLang) {
      currentLang = value;
      notify();
    }
  }

  const runtime: I18nRuntime = {
    t(source, comment) {
      return translate(createMessageId(source, comment), source);
    },
    translate,
    setLang,
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

  if (lazy && options.defaultLang !== options.sourceLang) {
    // 默认目标语言异步加载；失败时保持同步可用的 source fallback。
    void setLang(options.defaultLang).catch(() => {});
  }
  return runtime;
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
