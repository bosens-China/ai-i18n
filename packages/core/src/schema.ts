export type TranslationValue = string | null;

export interface LangOption {
  value: string;
  label: string;
}

export interface CacheMessage {
  sourceLang: string;
  comment?: string;
  translations: Record<string, TranslationValue>;
}

export interface TranslationMemoryFile {
  version: 1;
  revision: number;
  messages: Record<string, CacheMessage>;
}

export interface TranslationOverrideMessage {
  default?: Record<string, string>;
  byId?: Record<string, Record<string, string>>;
}

export interface TranslationOverridesFile {
  version: 1;
  messages: Record<string, TranslationOverrideMessage>;
}

export interface ExtractedMessage {
  id: string;
  source: string;
  comment?: string;
  locations: Array<{ line: number; column: number }>;
}

export interface ExtractedFile {
  version: 1;
  source: string;
  messages: ExtractedMessage[];
}

export interface LocaleFileV1 {
  version: 1;
  locale: LangOption;
  messages: Record<string, TranslationValue>;
}

export class AiI18nSchemaError extends Error {
  constructor(message: string) {
    super(`[ai-i18n] ${message}`);
    this.name = 'AiI18nSchemaError';
  }
}

export class TranslationConflictError extends Error {
  constructor(
    readonly messageId: string,
    readonly locale: string,
  ) {
    super(
      `[ai-i18n] message "${messageId}" has conflicting non-null translations for locale "${locale}"`,
    );
    this.name = 'TranslationConflictError';
  }
}

export function parseTranslationMemoryFile(
  value: unknown,
): TranslationMemoryFile {
  const root = record(value, 'translation memory');
  exactKeys(root, ['version', 'revision', 'messages'], 'translation memory');
  exactVersion(root, 'translation memory', 1);
  const messages = record(root.messages, 'translation memory.messages');

  for (const [id, message] of Object.entries(messages)) {
    validateCacheMessage(message, `translation memory.messages.${id}`);
  }
  integer(root.revision, 'translation memory.revision', 0);
  return value as TranslationMemoryFile;
}

export function parseTranslationOverridesFile(
  value: unknown,
): TranslationOverridesFile {
  const root = record(value, 'translation overrides');
  exactKeys(root, ['version', 'messages'], 'translation overrides');
  exactVersion(root, 'translation overrides', 1);
  const messages = record(root.messages, 'translation overrides.messages');

  for (const [source, value] of Object.entries(messages)) {
    const path = `translation overrides.messages.${source}`;
    const message = record(value, path);
    exactKeys(message, ['default', 'byId'], path);
    if (message.default !== undefined) {
      stringTranslations(message.default, `${path}.default`);
    }
    if (message.byId === undefined) continue;
    const byId = record(message.byId, `${path}.byId`);
    for (const [id, translations] of Object.entries(byId)) {
      if (!id.trim()) fail(`${path}.byId`, 'non-empty message IDs');
      stringTranslations(translations, `${path}.byId.${id}`);
    }
  }
  return value as TranslationOverridesFile;
}

export function parseExtractedFile(value: unknown): ExtractedFile {
  const root = record(value, 'extracted');
  exactKeys(root, ['version', 'source', 'messages'], 'extracted');
  exactVersion(root, 'extracted', 1);
  string(root.source, 'extracted.source');
  if (!Array.isArray(root.messages)) fail('extracted.messages', 'an array');
  root.messages.forEach((message, index) => {
    const path = `extracted.messages.${index}`;
    const entry = record(message, path);
    exactKeys(entry, ['id', 'source', 'comment', 'locations'], path);
    string(entry.id, `${path}.id`);
    string(entry.source, `${path}.source`);
    if (entry.comment !== undefined) string(entry.comment, `${path}.comment`);
    if (!Array.isArray(entry.locations)) fail(`${path}.locations`, 'an array');
    entry.locations.forEach((location, locationIndex) => {
      const locationPath = `${path}.locations.${locationIndex}`;
      const item = record(location, locationPath);
      exactKeys(item, ['line', 'column'], locationPath);
      integer(item.line, `${locationPath}.line`, 1);
      integer(item.column, `${locationPath}.column`, 0);
    });
  });
  return value as ExtractedFile;
}

export function parseLocaleFile(value: unknown): LocaleFileV1 {
  const root = record(value, 'locale');
  exactKeys(root, ['version', 'locale', 'messages'], 'locale');
  exactVersion(root, 'locale', 1);
  const locale = record(root.locale, 'locale.locale');
  exactKeys(locale, ['value', 'label'], 'locale.locale');
  string(locale.value, 'locale.locale.value');
  string(locale.label, 'locale.locale.label');
  translations(root.messages, 'locale.messages');
  return value as LocaleFileV1;
}

function validateCacheMessage(value: unknown, path: string): void {
  const message = record(value, path);
  exactKeys(message, ['sourceLang', 'comment', 'translations'], path);
  string(message.sourceLang, `${path}.sourceLang`);
  if (message.comment !== undefined) string(message.comment, `${path}.comment`);
  translations(message.translations, `${path}.translations`);
}

function translations(value: unknown, path: string): void {
  const entries = record(value, path);
  for (const [locale, translation] of Object.entries(entries)) {
    if (typeof translation !== 'string' && translation !== null) {
      fail(`${path}.${locale}`, 'a string or null');
    }
  }
}

function stringTranslations(value: unknown, path: string): void {
  const entries = record(value, path);
  for (const [locale, translation] of Object.entries(entries)) {
    if (typeof translation !== 'string') {
      fail(`${path}.${locale}`, 'a string');
    }
  }
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
): void {
  const allowed = new Set(expected);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) {
    throw new AiI18nSchemaError(`${path}.${unknown} is not part of the schema`);
  }
}

function exactVersion(
  value: Record<string, unknown>,
  schema: string,
  expected: number,
): void {
  if (value.version !== expected) {
    throw new AiI18nSchemaError(
      `${schema} schema version must be ${expected}; received ${String(value.version)}`,
    );
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(path, 'an object');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string') fail(path, 'a string');
}

function integer(value: unknown, path: string, minimum: number): void {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    fail(path, `an integer >= ${minimum}`);
  }
}

function fail(path: string, expected: string): never {
  throw new AiI18nSchemaError(`${path} must be ${expected}`);
}
