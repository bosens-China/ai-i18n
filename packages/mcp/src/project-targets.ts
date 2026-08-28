import { createMessageId, type ExtractedMessage } from '@ai-i18n/core';
import { fail } from './errors.js';
import { cacheMessage, type LoadedProject } from './project-files.js';
import type { MessageReference, TranslationTarget } from './project.js';

type Localized<T extends TranslationTarget> = T & { locale: string };

export interface ResolvedTarget<T extends Localized<TranslationTarget>> {
  input: T;
  message: ExtractedMessage;
  sourceFiles: string[];
}

export function resolveBatchLocales<T extends TranslationTarget>(
  inputs: readonly T[],
  defaultLocale?: string,
): Array<Localized<T>> {
  const itemLocaleIndexes = inputs.flatMap((input, index) =>
    input.locale === undefined ? [] : [index],
  );
  if (defaultLocale !== undefined && itemLocaleIndexes.length) {
    fail('INVALID_BATCH_LOCALE', {
      default_locale: defaultLocale,
      item_locale_indexes: itemLocaleIndexes,
    });
  }
  const missingLocaleIndexes = inputs.flatMap((input, index) =>
    input.locale === undefined && defaultLocale === undefined ? [index] : [],
  );
  if (missingLocaleIndexes.length) {
    fail('INVALID_BATCH_LOCALE', {
      missing_locale_indexes: missingLocaleIndexes,
    });
  }
  return inputs.map((input) => ({
    ...input,
    locale: defaultLocale ?? input.locale!,
  }));
}

export function resolveTargets<T extends Localized<TranslationTarget>>(
  project: LoadedProject,
  inputs: readonly T[],
): Array<ResolvedTarget<T>> {
  const active = activeMessages(project);
  return inputs.map((input) => {
    const messageId = createMessageId(input.message.source, {
      comment: input.message.comment,
    });
    const found = active.get(messageId);
    if (!found) {
      const suggestions = messageSuggestions(active, input.message);
      fail('MESSAGE_NOT_FOUND', {
        ...targetDetails(input),
        suggestions,
        next_tool: 'ai_i18n_list_translations',
      });
    }
    const cached = cacheMessage(project, found.message);
    if (!(input.locale in cached.translations)) {
      fail('UNKNOWN_LOCALE', {
        ...targetDetails(input),
        available_locales: Object.keys(cached.translations),
      });
    }
    return {
      input,
      message: found.message,
      sourceFiles: [...found.sourceFiles].sort(),
    };
  });
}

export function deduplicateTargets<T extends Localized<TranslationTarget>>(
  targets: readonly ResolvedTarget<T>[],
  key: (target: ResolvedTarget<T>) => string,
  value?: (target: ResolvedTarget<T>) => string,
): { targets: Array<ResolvedTarget<T>>; deduplicatedCount: number } {
  const unique = new Map<
    string,
    { target: ResolvedTarget<T>; value?: string }
  >();
  let deduplicatedCount = 0;
  for (const target of targets) {
    const targetKey = key(target);
    const requestedValue = value?.(target);
    const previous = unique.get(targetKey);
    if (!previous) {
      unique.set(targetKey, { target, value: requestedValue });
      continue;
    }
    if (value && previous.value !== requestedValue) {
      fail('DUPLICATE_TARGET_CONFLICT', {
        ...targetDetails(target.input),
        first_value: previous.value,
        requested_value: requestedValue,
      });
    }
    deduplicatedCount += 1;
  }
  return {
    targets: [...unique.values()].map((item) => item.target),
    deduplicatedCount,
  };
}

export function affectedFileCount(
  targets: readonly ResolvedTarget<Localized<TranslationTarget>>[],
): number {
  return new Set(targets.flatMap((target) => target.sourceFiles)).size;
}

export function targetDetails(
  target: Localized<TranslationTarget>,
): Record<string, unknown> {
  const files = (target as TranslationTarget & { files?: readonly string[] })
    .files;
  return {
    message: target.message,
    ...(files ? { files } : {}),
    locale: target.locale,
  };
}

function messageSuggestions(
  active: Map<string, { message: ExtractedMessage; sourceFiles: Set<string> }>,
  requested: MessageReference,
): MessageReference[] {
  const normalizedRequested = normalizeSuggestionSource(requested.source);
  const requestedLength = [...normalizedRequested].length;
  const candidates = [...active.values()].flatMap(({ message }) => {
    if (message.source === requested.source) {
      return [{ message, score: 0 }];
    }
    const normalizedCandidate = normalizeSuggestionSource(message.source);
    if (normalizedCandidate === normalizedRequested) {
      return [{ message, score: 1 }];
    }
    const candidateLength = [...normalizedCandidate].length;
    if (Math.min(requestedLength, candidateLength) < 4) return [];
    const maxLength = Math.max(requestedLength, candidateLength);
    if (maxLength > 200) return [];
    const maxDistance = Math.min(8, Math.max(2, Math.ceil(maxLength * 0.2)));
    const distance = boundedEditDistance(
      normalizedRequested,
      normalizedCandidate,
      maxDistance,
    );
    return distance <= maxDistance
      ? [{ message, score: 10 + distance / maxLength }]
      : [];
  });
  const sorted = candidates.sort(
    (left, right) =>
      left.score - right.score ||
      left.message.source.localeCompare(right.message.source) ||
      (left.message.comment ?? '').localeCompare(right.message.comment ?? ''),
  );
  const suggestions: MessageReference[] = [];
  let characterCount = 0;
  for (const { message } of sorted) {
    const suggestion = messageReference(message);
    const size = JSON.stringify(suggestion).length;
    if (characterCount + size > 20_000) continue;
    suggestions.push(suggestion);
    characterCount += size;
    if (suggestions.length === 5) break;
  }
  return suggestions;
}

function normalizeSuggestionSource(source: string): string {
  return source.normalize('NFKC').replaceAll(/\s+/gu, ' ').trim().toLowerCase();
}

function boundedEditDistance(
  left: string,
  right: string,
  maximum: number,
): number {
  const leftCharacters = [...left];
  const rightCharacters = [...right];
  if (Math.abs(leftCharacters.length - rightCharacters.length) > maximum) {
    return maximum + 1;
  }
  let previous = rightCharacters.map((_, index) => index + 1);
  previous.unshift(0);
  for (const [leftIndex, leftCharacter] of leftCharacters.entries()) {
    const current = [leftIndex + 1];
    let rowMinimum = current[0]!;
    for (const [rightIndex, rightCharacter] of rightCharacters.entries()) {
      const value = Math.min(
        current[rightIndex]! + 1,
        previous[rightIndex + 1]! + 1,
        previous[rightIndex]! + (leftCharacter === rightCharacter ? 0 : 1),
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous.at(-1)!;
}

function activeMessages(
  project: LoadedProject,
): Map<string, { message: ExtractedMessage; sourceFiles: Set<string> }> {
  const active = new Map<
    string,
    { message: ExtractedMessage; sourceFiles: Set<string> }
  >();
  for (const file of project.extracted) {
    for (const message of file.messages) {
      const found = active.get(message.id);
      if (found) {
        found.sourceFiles.add(file.source);
      } else {
        active.set(message.id, {
          message,
          sourceFiles: new Set([file.source]),
        });
      }
    }
  }
  return active;
}

export function messageReference(
  message: Pick<ExtractedMessage, 'source' | 'comment'>,
): MessageReference {
  return {
    source: message.source,
    ...(message.comment ? { comment: message.comment } : {}),
  };
}
