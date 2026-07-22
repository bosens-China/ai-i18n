import { createMessageId } from './message-id.js';
import type { LangOption, TranslationValue } from './schema.js';
import { TranslationConflictError } from './schema.js';

export type ModuleMessages = Record<
  string,
  Record<string, TranslationValue>
>;

export interface I18nRuntimeOptions {
  sourceLang: string;
  defaultLang: string;
  locales: readonly LangOption[];
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
  let modules = new Map<string, ModuleMessages>();
  let catalog = new Map<string, Map<string, TranslationValue>>();
  let currentLang = options.defaultLang;

  function rebuild(nextModules: Map<string, ModuleMessages>) {
    const nextCatalog = new Map<string, Map<string, TranslationValue>>();
    for (const locale of locales) nextCatalog.set(locale.value, new Map());

    for (const [moduleId, moduleMessages] of nextModules) {
      validateModule(moduleId, moduleMessages, localeValues, locales.length);
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

  return {
    t(source, comment) {
      return translate(createMessageId(source, comment), source);
    },
    translate,
    async setLang(value) {
      if (!localeValues.has(value)) {
        throw new RangeError(`[ai-i18n] unsupported locale "${value}"`);
      }
      if (value !== currentLang) {
        currentLang = value;
        notify();
      }
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
  };
}

function validateModule(
  moduleId: string,
  messages: ModuleMessages,
  locales: Set<string>,
  localeCount: number,
): void {
  const entries = Object.entries(messages);
  if (entries.length !== localeCount) {
    throw new Error(`[ai-i18n] module "${moduleId}" must register every locale`);
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
