import type {
  ReviewMessage,
  ReviewSnapshot,
  ReviewSourceLocation,
} from '@ai-i18n/core';

const TEMPLATE_TOKEN_RE = /\{\{=*[0-9]+\}\}/g;

export interface ReviewClientTarget {
  key: string;
  file: string;
  location: ReviewSourceLocation;
}

export interface ReviewValueIndex {
  exact: ReadonlyMap<string, ReadonlySet<string>>;
  templates: readonly { key: string; pattern: RegExp }[];
}

export function reviewClientMessageKey(message: {
  source: string;
  comment?: string;
}): string {
  return JSON.stringify([message.source, message.comment ?? null]);
}

export function createReviewValueIndex(
  snapshot: ReviewSnapshot,
): ReviewValueIndex {
  const exact = new Map<string, Set<string>>();
  const templates: Array<{ key: string; pattern: RegExp }> = [];
  const seenTemplates = new Set<string>();

  for (const message of snapshot.messages) {
    const key = reviewClientMessageKey(message.message);
    for (const value of reviewValues(message)) {
      const normalized = normalizeReviewValue(value);
      if (!normalized) continue;
      const keys = exact.get(normalized) ?? new Set<string>();
      keys.add(key);
      exact.set(normalized, keys);
      if (!TEMPLATE_TOKEN_RE.test(normalized)) continue;
      TEMPLATE_TOKEN_RE.lastIndex = 0;
      const identity = `${key}\0${normalized}`;
      if (seenTemplates.has(identity)) continue;
      seenTemplates.add(identity);
      templates.push({ key, pattern: templatePattern(normalized) });
    }
  }
  return { exact, templates };
}

export function matchReviewValue(
  index: ReviewValueIndex,
  value: string,
): string[] {
  const normalized = normalizeReviewValue(value);
  if (!normalized) return [];
  const matches = new Set(index.exact.get(normalized) ?? []);
  for (const template of index.templates) {
    if (template.pattern.test(normalized)) matches.add(template.key);
  }
  return [...matches];
}

export function uniqueReviewTarget(
  snapshot: ReviewSnapshot,
  keys: readonly string[],
): ReviewClientTarget | undefined {
  if (keys.length !== 1) return undefined;
  const message = snapshot.messages.find(
    (item) => reviewClientMessageKey(item.message) === keys[0],
  );
  if (!message) return undefined;
  const targets = message.occurrences.flatMap((occurrence) =>
    occurrence.locations.map((location) => ({
      key: keys[0]!,
      file: occurrence.sourceFile,
      location: { ...location },
    })),
  );
  return targets.length === 1 ? targets[0] : undefined;
}

export function normalizeReviewValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function reviewValues(message: ReviewMessage): string[] {
  return [
    message.message.source,
    ...Object.values(message.translations).filter(
      (value): value is string => value !== null,
    ),
    ...message.overrides.map((override) => override.value),
  ];
}

function templatePattern(template: string): RegExp {
  let source = '^';
  let offset = 0;
  for (const match of template.matchAll(TEMPLATE_TOKEN_RE)) {
    source += escapeRegExp(template.slice(offset, match.index));
    source += '.*?';
    offset = match.index + match[0].length;
  }
  source += `${escapeRegExp(template.slice(offset))}$`;
  return new RegExp(source, 'u');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
