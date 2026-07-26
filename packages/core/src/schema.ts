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
  exactVersion(root, 'extracted', 1);
  string(root.source, 'extracted.source');
  if (!Array.isArray(root.messages)) fail('extracted.messages', 'an array');
  root.messages.forEach((message, index) => {
    const path = `extracted.messages.${index}`;
    const entry = record(message, path);
    string(entry.id, `${path}.id`);
    string(entry.source, `${path}.source`);
    if ('translations' in entry) {
      throw new AiI18nSchemaError(
        `${path}.translations is not part of the extracted schema`,
      );
    }
    if ('context' in entry) {
      throw new AiI18nSchemaError(`${path}.context was replaced by comment`);
    }
    if (entry.comment !== undefined) string(entry.comment, `${path}.comment`);
    if (!Array.isArray(entry.locations)) fail(`${path}.locations`, 'an array');
    entry.locations.forEach((location, locationIndex) => {
      const locationPath = `${path}.locations.${locationIndex}`;
      const item = record(location, locationPath);
      integer(item.line, `${locationPath}.line`, 1);
      integer(item.column, `${locationPath}.column`, 0);
    });
  });
  return value as ExtractedFile;
}

export function parseLocaleFile(value: unknown): LocaleFileV1 {
  const root = record(value, 'locale');
  exactVersion(root, 'locale', 1);
  const locale = record(root.locale, 'locale.locale');
  string(locale.value, 'locale.locale.value');
  string(locale.label, 'locale.locale.label');
  translations(root.messages, 'locale.messages');
  return value as LocaleFileV1;
}

export function mergeCacheMessages(
  current: Record<string, CacheMessage>,
  incoming: Record<string, CacheMessage>,
): Record<string, CacheMessage> {
  const merged = cloneMessages(current);

  for (const [id, next] of Object.entries(incoming)) {
    const previous = merged[id];
    if (!previous) {
      merged[id] = cloneMessage(next);
      continue;
    }
    if (!previous.comment && next.comment) previous.comment = next.comment;
    if (!previous.sourceLang && next.sourceLang) {
      previous.sourceLang = next.sourceLang;
    }

    for (const [locale, value] of Object.entries(next.translations)) {
      const oldValue = previous.translations[locale];
      if (oldValue != null && value != null && oldValue !== value) {
        throw new TranslationConflictError(id, locale);
      }
      if (oldValue == null && value !== null)
        previous.translations[locale] = value;
      else if (!(locale in previous.translations))
        previous.translations[locale] = null;
    }
  }
  return merged;
}

function validateCacheMessage(value: unknown, path: string): void {
  const message = record(value, path);
  string(message.sourceLang, `${path}.sourceLang`);
  if ('context' in message) {
    throw new AiI18nSchemaError(`${path}.context was replaced by comment`);
  }
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

function cloneMessage(message: CacheMessage): CacheMessage {
  return {
    sourceLang: message.sourceLang,
    ...(message.comment === undefined ? {} : { comment: message.comment }),
    translations: { ...message.translations },
  };
}

function cloneMessages(
  messages: Record<string, CacheMessage>,
): Record<string, CacheMessage> {
  return Object.fromEntries(
    Object.entries(messages).map(([id, message]) => [
      id,
      cloneMessage(message),
    ]),
  );
}
