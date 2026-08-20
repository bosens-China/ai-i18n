import {
  parseTranslationOverridesFile,
  type TranslationOverrideOccurrence,
  type TranslationOverrideRule,
  type TranslationOverridesFile,
} from './schema.js';

export interface OverrideMessageReference {
  source: string;
  comment?: string;
}

export interface AtomicOverrideTarget extends OverrideMessageReference {
  file?: string;
  location?: Omit<TranslationOverrideOccurrence, 'file'>;
  locale: string;
}

export interface AtomicOverride extends AtomicOverrideTarget {
  value: string;
}

export function atomicOverrides(
  overrides: TranslationOverridesFile,
): Map<string, AtomicOverride> {
  const entries = new Map<string, AtomicOverride>();
  for (const rule of overrides.rules) {
    const scopes = rule.occurrences?.map((occurrence) => ({
      file: occurrence.file,
      location: { line: occurrence.line, column: occurrence.column },
    })) ??
      rule.files?.map((file) => ({ file })) ?? [{}];
    for (const scope of scopes) {
      for (const [locale, value] of Object.entries(rule.translations)) {
        const entry = {
          source: rule.source,
          ...(rule.comment ? { comment: rule.comment } : {}),
          ...scope,
          locale,
          value,
        };
        entries.set(atomicOverrideKey(entry), entry);
      }
    }
  }
  return entries;
}

export function overridesFromAtomic(
  entries: Iterable<AtomicOverride>,
): TranslationOverridesFile {
  const globalRules = new Map<string, TranslationOverrideRule>();
  const fileTranslations = new Map<
    string,
    {
      message: OverrideMessageReference;
      file: string;
      translations: Record<string, string>;
    }
  >();
  const occurrenceTranslations = new Map<
    string,
    {
      message: OverrideMessageReference;
      occurrence: TranslationOverrideOccurrence;
      translations: Record<string, string>;
    }
  >();
  for (const entry of entries) {
    const messageKey = JSON.stringify([entry.source, entry.comment ?? null]);
    if (entry.location) {
      if (!entry.file) {
        throw new TypeError(
          'An occurrence-scoped override requires a source file.',
        );
      }
      const key = JSON.stringify([
        entry.source,
        entry.comment ?? null,
        entry.file,
        entry.location.line,
        entry.location.column,
      ]);
      const current = occurrenceTranslations.get(key) ?? {
        message: {
          source: entry.source,
          ...(entry.comment ? { comment: entry.comment } : {}),
        },
        occurrence: { file: entry.file, ...entry.location },
        translations: {},
      };
      current.translations[entry.locale] = entry.value;
      occurrenceTranslations.set(key, current);
      continue;
    }
    if (!entry.file) {
      const rule = globalRules.get(messageKey) ?? {
        source: entry.source,
        ...(entry.comment ? { comment: entry.comment } : {}),
        translations: {},
      };
      rule.translations[entry.locale] = entry.value;
      globalRules.set(messageKey, rule);
      continue;
    }
    const key = JSON.stringify([
      entry.source,
      entry.comment ?? null,
      entry.file,
    ]);
    const current = fileTranslations.get(key) ?? {
      message: {
        source: entry.source,
        ...(entry.comment ? { comment: entry.comment } : {}),
      },
      file: entry.file,
      translations: {},
    };
    current.translations[entry.locale] = entry.value;
    fileTranslations.set(key, current);
  }

  const groupedFiles = new Map<string, TranslationOverrideRule>();
  for (const entry of fileTranslations.values()) {
    const translationKey = JSON.stringify(
      Object.entries(entry.translations).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    const key = JSON.stringify([
      entry.message.source,
      entry.message.comment ?? null,
      translationKey,
    ]);
    const rule = groupedFiles.get(key) ?? {
      ...entry.message,
      files: [],
      translations: entry.translations,
    };
    rule.files!.push(entry.file);
    groupedFiles.set(key, rule);
  }
  const groupedOccurrences = new Map<string, TranslationOverrideRule>();
  for (const entry of occurrenceTranslations.values()) {
    const translationKey = JSON.stringify(
      Object.entries(entry.translations).sort(([left], [right]) =>
        left < right ? -1 : left > right ? 1 : 0,
      ),
    );
    const key = JSON.stringify([
      entry.message.source,
      entry.message.comment ?? null,
      translationKey,
    ]);
    const rule = groupedOccurrences.get(key) ?? {
      ...entry.message,
      occurrences: [],
      translations: entry.translations,
    };
    rule.occurrences!.push(entry.occurrence);
    groupedOccurrences.set(key, rule);
  }
  return parseTranslationOverridesFile({
    version: 2,
    rules: [
      ...globalRules.values(),
      ...groupedFiles.values(),
      ...groupedOccurrences.values(),
    ],
  });
}

export function atomicOverrideKey(target: AtomicOverrideTarget): string {
  return JSON.stringify([
    target.source,
    target.comment ?? null,
    target.file ?? null,
    target.location?.line ?? null,
    target.location?.column ?? null,
    target.locale,
  ]);
}
