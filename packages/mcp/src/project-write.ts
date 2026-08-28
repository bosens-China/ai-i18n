import path from 'node:path';
import {
  atomicOverrideKey,
  atomicOverrides,
  hasSameTemplateTokens,
  overridesFromAtomic,
  templateTokens,
  type ExtractedMessage,
} from '@ai-i18n/core';
import { transactTranslationOverrides } from '@ai-i18n/core/translation-memory';
import { fail } from './errors.js';
import {
  decodeOverrideId,
  overrideTargetKey,
  type OverrideTarget,
} from './override-id.js';
import { loadProject, type LoadedProject } from './project-files.js';
import { resolveOverrideTargets } from './project-override-targets.js';
import {
  affectedFileCount,
  deduplicateTargets,
  resolveBatchLocales,
  resolveTargets,
  targetDetails,
  type ResolvedTarget,
} from './project-targets.js';
import type {
  ClearResult,
  ClearTranslationsInput,
  DeleteOverridesInput,
  DeleteResult,
  SetOverridesInput,
  SetResult,
  SetTranslationsInput,
  TranslationTarget,
} from './project.js';

type LocalizedTranslationTarget = TranslationTarget & { locale: string };

export async function setTranslations(
  input: SetTranslationsInput,
): Promise<SetResult> {
  const updates = resolveBatchLocales(input.updates, input.default_locale);
  const project = await loadProject(input.i18n_directory);
  const resolved = resolveTargets(project, updates);
  const { targets, deduplicatedCount } = deduplicateTargets(
    resolved,
    (target) => [target.message.id, target.input.locale].join('\0'),
    (target) => target.input.value,
  );
  for (const target of targets) {
    if (!hasSameTemplateTokens(target.message.source, target.input.value)) {
      fail(
        'TEMPLATE_TOKEN_MISMATCH',
        templateTokenMismatchDetails(
          target.message.source,
          target.input.value,
          targetDetails(target.input),
        ),
      );
    }
  }
  let addedCount = 0;
  let overwrittenCount = 0;
  let unchangedCount = 0;
  // 事务回调在共享锁内拿到最新文件，整批复验通过后才修改字段。
  await project.memoryStore.transact((memory) => {
    const conflicts = targets.flatMap(({ input: update, message }) => {
      const translations = lockedTranslations(memory.messages, message, update);
      const current = translations[update.locale] ?? null;
      return !input.overwrite_existing &&
        current !== null &&
        current !== update.value
        ? [
            {
              ...targetDetails(update),
              current_value: current,
              requested_value: update.value,
            },
          ]
        : [];
    });
    if (conflicts.length) {
      fail('TRANSLATION_CONFLICT', {
        conflict_count: conflicts.length,
        conflicts,
        retry: { overwrite_existing: true },
      });
    }
    for (const { input: update, message } of targets) {
      const translations = lockedTranslations(memory.messages, message, update);
      const current = translations[update.locale] ?? null;
      if (current === update.value) {
        unchangedCount += 1;
      } else if (current === null) {
        translations[update.locale] = update.value;
        addedCount += 1;
      } else {
        translations[update.locale] = update.value;
        overwrittenCount += 1;
      }
    }
  });
  return setResult(
    targets,
    addedCount,
    overwrittenCount,
    unchangedCount,
    deduplicatedCount,
  );
}

export async function clearTranslations(
  input: ClearTranslationsInput,
): Promise<ClearResult> {
  const requestedTargets = resolveBatchLocales(
    input.targets,
    input.default_locale,
  );
  const project = await loadProject(input.i18n_directory);
  const { targets, deduplicatedCount } = deduplicateTargets(
    resolveTargets(project, requestedTargets),
    (target) => [target.message.id, target.input.locale].join('\0'),
  );
  let clearedCount = 0;
  let unchangedCount = 0;
  await project.memoryStore.transact((memory) => {
    for (const { input: target, message } of targets) {
      const translations = lockedTranslations(memory.messages, message, target);
      if ((translations[target.locale] ?? null) === null) {
        unchangedCount += 1;
      } else {
        translations[target.locale] = null;
        clearedCount += 1;
      }
    }
  });
  return {
    cleared_count: clearedCount,
    unchanged_count: unchangedCount,
    deduplicated_count: deduplicatedCount,
    affected_file_count: affectedFileCount(targets),
  };
}

export async function setOverrides(
  input: SetOverridesInput,
): Promise<SetResult> {
  const updates = resolveBatchLocales(input.updates, input.default_locale);
  const project = await loadProject(input.i18n_directory);
  const { targets, deduplicatedCount } = deduplicateTargets(
    resolveOverrideTargets(project, updates),
    (target) =>
      atomicOverrideKey({
        source: target.message.source,
        ...(target.message.comment ? { comment: target.message.comment } : {}),
        ...(target.input.files?.[0] ? { file: target.input.files[0] } : {}),
        ...(target.input.occurrences?.[0]
          ? {
              file: target.input.occurrences[0].source_file,
              location: {
                line: target.input.occurrences[0].line,
                column: target.input.occurrences[0].column,
              },
            }
          : {}),
        locale: target.input.locale,
      }),
    (target) => target.input.value,
  );
  for (const target of targets) {
    if (!hasSameTemplateTokens(target.message.source, target.input.value)) {
      fail(
        'TEMPLATE_TOKEN_MISMATCH',
        templateTokenMismatchDetails(
          target.message.source,
          target.input.value,
          targetDetails(target.input),
        ),
      );
    }
  }
  let addedCount = 0;
  let overwrittenCount = 0;
  let unchangedCount = 0;
  // overrides 使用独立锁；人工结果不会写回 AI Translation Memory。
  await transactTranslationOverrides(
    path.join(project.directory, 'overrides'),
    (overrides) => {
      const entries = atomicOverrides(overrides);
      for (const { input: update, message: extracted } of targets) {
        const scopes = update.occurrences?.map((occurrence) => ({
          file: occurrence.source_file,
          location: { line: occurrence.line, column: occurrence.column },
        })) ??
          update.files?.map((file) => ({ file })) ?? [{}];
        for (const scope of scopes) {
          const entry = {
            source: extracted.source,
            ...(extracted.comment ? { comment: extracted.comment } : {}),
            ...scope,
            locale: update.locale,
            value: update.value,
          };
          const key = atomicOverrideKey(entry);
          const current = entries.get(key);
          if (current?.value === update.value) {
            unchangedCount += 1;
          } else {
            entries.set(key, entry);
            if (!current) addedCount += 1;
            else overwrittenCount += 1;
          }
        }
      }
      overrides.rules = overridesFromAtomic(entries.values()).rules;
    },
  );
  return setResult(
    targets,
    addedCount,
    overwrittenCount,
    unchangedCount,
    deduplicatedCount,
  );
}

function templateTokenMismatchDetails(
  source: string,
  value: string,
  details: Record<string, unknown>,
): Record<string, unknown> {
  const expectedTokens = templateTokens(source);
  const receivedTokens = templateTokens(value);
  return {
    ...details,
    expected_tokens: expectedTokens,
    received_tokens: receivedTokens,
    missing_tokens: subtractTokens(expectedTokens, receivedTokens),
    unexpected_tokens: subtractTokens(receivedTokens, expectedTokens),
  };
}

function subtractTokens(tokens: string[], matchedTokens: string[]): string[] {
  const remaining = [...matchedTokens];
  return tokens.filter((token) => {
    const index = remaining.indexOf(token);
    if (index === -1) return true;
    remaining.splice(index, 1);
    return false;
  });
}

export async function deleteOverrides(
  input: DeleteOverridesInput,
): Promise<DeleteResult> {
  const project = await loadProject(input.i18n_directory);
  const targets = input.override_ids.map(decodeOverrideId);
  rejectDuplicateTargets(targets, overrideTargetKey);
  let deletedCount = 0;
  let unchangedCount = 0;
  await transactTranslationOverrides(
    path.join(project.directory, 'overrides'),
    (overrides) => {
      for (const target of targets) {
        const index = overrides.rules.findIndex((rule) =>
          matchesOverrideRule(rule, target),
        );
        const rule = overrides.rules[index];
        if (!rule || rule.translations[target.locale] === undefined) {
          unchangedCount += 1;
          continue;
        }
        delete rule.translations[target.locale];
        if (Object.keys(rule.translations).length === 0) {
          overrides.rules.splice(index, 1);
        }
        deletedCount += 1;
      }
    },
  );
  return {
    deleted_count: deletedCount,
    unchanged_count: unchangedCount,
  };
}

function matchesOverrideRule(
  rule: LoadedProject['overrides']['rules'][number],
  target: OverrideTarget,
): boolean {
  return (
    overrideTargetKey({
      source: rule.source,
      ...(rule.comment ? { comment: rule.comment } : {}),
      ...(rule.files ? { files: rule.files } : {}),
      ...(rule.occurrences
        ? {
            occurrences: rule.occurrences.map((occurrence) => ({
              source_file: occurrence.file,
              line: occurrence.line,
              column: occurrence.column,
            })),
          }
        : {}),
      locale: target.locale,
    }) === overrideTargetKey(target)
  );
}

function lockedTranslations(
  messages: LoadedProject['messages'],
  extracted: ExtractedMessage,
  target: LocalizedTranslationTarget,
): Record<string, string | null> {
  const message = messages[extracted.id];
  if (!message) {
    fail('MESSAGE_MISSING_FROM_TRANSLATIONS', targetDetails(target));
  }
  if (
    message.source !== extracted.source ||
    message.comment !== extracted.comment
  ) {
    fail('MESSAGE_METADATA_MISMATCH', targetDetails(target));
  }
  if (!(target.locale in message.translations)) {
    fail('UNKNOWN_LOCALE', {
      ...targetDetails(target),
      available_locales: Object.keys(message.translations),
    });
  }
  return message.translations;
}

function rejectDuplicateTargets<T>(
  items: readonly T[],
  key: (item: T) => string,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) fail('DUPLICATE_TARGET', { target: value });
    seen.add(value);
  }
}

function setResult(
  targets: readonly ResolvedTarget<LocalizedTranslationTarget>[],
  addedCount: number,
  overwrittenCount: number,
  unchangedCount: number,
  deduplicatedCount: number,
): SetResult {
  return {
    added_count: addedCount,
    overwritten_count: overwrittenCount,
    unchanged_count: unchangedCount,
    deduplicated_count: deduplicatedCount,
    affected_file_count: affectedFileCount(targets),
  };
}
