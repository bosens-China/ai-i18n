import {
  parseTranslationOverridesFile,
  type TranslationOverrideRule,
  type TranslationOverridesFile,
} from './schema.js';

export interface OverrideMessageReference {
  source: string;
  comment?: string;
}

export interface AtomicOverrideTarget extends OverrideMessageReference {
  file?: string;
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
    for (const file of rule.files ?? [undefined]) {
      for (const [locale, value] of Object.entries(rule.translations)) {
        const entry = {
          source: rule.source,
          ...(rule.comment ? { comment: rule.comment } : {}),
          ...(file ? { file } : {}),
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
  for (const entry of entries) {
    const messageKey = JSON.stringify([entry.source, entry.comment ?? null]);
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
  return parseTranslationOverridesFile({
    version: 2,
    rules: [...globalRules.values(), ...groupedFiles.values()],
  });
}

export function atomicOverrideKey(target: AtomicOverrideTarget): string {
  return JSON.stringify([
    target.source,
    target.comment ?? null,
    target.file ?? null,
    target.locale,
  ]);
}
