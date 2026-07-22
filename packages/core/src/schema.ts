export type TranslationValue = string | null;

export interface LangOption {
  value: string;
  label: string;
}

export interface CacheMessage {
  source: string;
  comment?: string;
  translations: Record<string, TranslationValue>;
}

export interface CacheFileV1 {
  version: 1;
  files: Record<
    string,
    {
      fingerprint: string;
      messageIds: string[];
    }
  >;
  messages: Record<string, CacheMessage>;
}

export interface ExtractedMessage extends CacheMessage {
  id: string;
  locations: Array<{ line: number; column: number }>;
}

export interface ExtractedFileV1 {
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

export function parseCacheFile(value: unknown): CacheFileV1 {
  const root = record(value, 'cache');
  version(root, 'cache');
  const files = record(root.files, 'cache.files');
  const messages = record(root.messages, 'cache.messages');

  for (const [path, file] of Object.entries(files)) {
    const entry = record(file, `cache.files.${path}`);
    string(entry.fingerprint, `cache.files.${path}.fingerprint`);
    stringArray(entry.messageIds, `cache.files.${path}.messageIds`);
  }
  for (const [id, message] of Object.entries(messages)) {
    validateCacheMessage(message, `cache.messages.${id}`);
  }
  return value as CacheFileV1;
}

export function parseExtractedFile(value: unknown): ExtractedFileV1 {
  const root = record(value, 'extracted');
  version(root, 'extracted');
  string(root.source, 'extracted.source');
  if (!Array.isArray(root.messages)) fail('extracted.messages', 'an array');
  root.messages.forEach((message, index) => {
    const path = `extracted.messages.${index}`;
    const entry = record(message, path);
    string(entry.id, `${path}.id`);
    validateCacheMessage(entry, path);
    if (!Array.isArray(entry.locations)) fail(`${path}.locations`, 'an array');
    entry.locations.forEach((location, locationIndex) => {
      const locationPath = `${path}.locations.${locationIndex}`;
      const item = record(location, locationPath);
      integer(item.line, `${locationPath}.line`, 1);
      integer(item.column, `${locationPath}.column`, 0);
    });
  });
  return value as ExtractedFileV1;
}

export function parseLocaleFile(value: unknown): LocaleFileV1 {
  const root = record(value, 'locale');
  version(root, 'locale');
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
    if (
      previous.source !== next.source ||
      (previous.comment ?? '') !== (next.comment ?? '')
    ) {
      throw new Error(`[ai-i18n] message "${id}" has inconsistent metadata`);
    }

    for (const [locale, value] of Object.entries(next.translations)) {
      const oldValue = previous.translations[locale];
      if (oldValue != null && value != null && oldValue !== value) {
        throw new TranslationConflictError(id, locale);
      }
      if (oldValue == null && value !== null) previous.translations[locale] = value;
      else if (!(locale in previous.translations)) previous.translations[locale] = null;
    }
  }
  return merged;
}

function validateCacheMessage(value: unknown, path: string): void {
  const message = record(value, path);
  string(message.source, `${path}.source`);
  migrateLegacyContext(message, path);
  if (message.comment !== undefined) string(message.comment, `${path}.comment`);
  translations(message.translations, `${path}.translations`);
}

function migrateLegacyContext(
  message: Record<string, unknown>,
  path: string,
): void {
  if (message.context === undefined) return;
  string(message.context, `${path}.context`);
  if (
    message.comment !== undefined &&
    message.comment !== message.context
  ) {
    throw new AiI18nSchemaError(
      `${path}.comment conflicts with legacy ${path}.context`,
    );
  }
  message.comment = message.context;
  delete message.context;
}

function translations(value: unknown, path: string): void {
  const entries = record(value, path);
  for (const [locale, translation] of Object.entries(entries)) {
    if (typeof translation !== 'string' && translation !== null) {
      fail(`${path}.${locale}`, 'a string or null');
    }
  }
}

function version(value: Record<string, unknown>, schema: string): void {
  if (value.version !== 1) {
    throw new AiI18nSchemaError(
      `${schema} schema version must be 1; received ${String(value.version)}`,
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

function stringArray(value: unknown, path: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail(path, 'an array of strings');
  }
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
    source: message.source,
    ...(message.comment === undefined ? {} : { comment: message.comment }),
    translations: { ...message.translations },
  };
}

function cloneMessages(
  messages: Record<string, CacheMessage>,
): Record<string, CacheMessage> {
  return Object.fromEntries(
    Object.entries(messages).map(([id, message]) => [id, cloneMessage(message)]),
  );
}
