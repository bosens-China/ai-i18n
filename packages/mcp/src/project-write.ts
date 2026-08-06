import path from 'node:path';
import { hasSameTemplateTokens, type ExtractedMessage } from '@ai-i18n/core';
import { transactTranslationOverrides } from '@ai-i18n/core/translation-memory';
import { fail } from './errors.js';
import {
  decodeOverrideId,
  overrideTargetKey,
  type OverrideTarget,
} from './override-id.js';
import { loadProject, type LoadedProject } from './project-files.js';
import {
  affectedFileCount,
  deduplicateTargets,
  resolveTargets,
  sourceFilesForSource,
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

export async function setTranslations(
  input: SetTranslationsInput,
): Promise<SetResult> {
  const project = await loadProject(input.i18n_directory);
  const resolved = resolveTargets(project, input.updates);
  const { targets, deduplicatedCount } = deduplicateTargets(
    resolved,
    (target) => [target.message.id, target.input.locale].join('\0'),
    (target) => target.input.value,
  );
  for (const target of targets) {
    if (!hasSameTemplateTokens(target.message.source, target.input.value)) {
      fail('TEMPLATE_TOKEN_MISMATCH', targetDetails(target.input));
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
  const project = await loadProject(input.i18n_directory);
  const { targets, deduplicatedCount } = deduplicateTargets(
    resolveTargets(project, input.targets),
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
  const project = await loadProject(input.i18n_directory);
  const resolved = resolveTargets(project, input.updates).map((target) =>
    target.input.scope === 'default'
      ? {
          ...target,
          sourceFiles: sourceFilesForSource(project, target.message.source),
        }
      : target,
  );
  const { targets, deduplicatedCount } = deduplicateTargets(
    resolved,
    (target) =>
      overrideTargetKey({
        scope: target.input.scope,
        source: target.message.source,
        ...(target.input.scope === 'message'
          ? { message_id: target.message.id }
          : {}),
        locale: target.input.locale,
      }),
    (target) => target.input.value,
  );
  for (const target of targets) {
    if (target.input.scope === 'message' && !target.message.comment) {
      fail('MESSAGE_SCOPE_REQUIRES_COMMENT', targetDetails(target.input));
    }
    if (!hasSameTemplateTokens(target.message.source, target.input.value)) {
      fail('TEMPLATE_TOKEN_MISMATCH', targetDetails(target.input));
    }
  }
  let addedCount = 0;
  let overwrittenCount = 0;
  let unchangedCount = 0;
  // overrides 使用独立锁；人工结果不会写回 AI Translation Memory。
  await transactTranslationOverrides(
    path.join(project.directory, 'overrides.json'),
    (overrides) => {
      for (const { input: update, message: extracted } of targets) {
        const message = (overrides.messages[extracted.source] ??= {});
        const translations =
          update.scope === 'message'
            ? ((message.byId ??= {})[extracted.id] ??= {})
            : (message.default ??= {});
        const current = translations[update.locale];
        if (current === update.value) {
          unchangedCount += 1;
        } else {
          translations[update.locale] = update.value;
          if (current === undefined) addedCount += 1;
          else overwrittenCount += 1;
        }
      }
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

export async function deleteOverrides(
  input: DeleteOverridesInput,
): Promise<DeleteResult> {
  const project = await loadProject(input.i18n_directory);
  const targets = input.override_ids.map(decodeOverrideId);
  rejectDuplicateTargets(targets, overrideTargetKey);
  let deletedCount = 0;
  let unchangedCount = 0;
  await transactTranslationOverrides(
    path.join(project.directory, 'overrides.json'),
    (overrides) => {
      for (const target of targets) {
        const message = overrides.messages[target.source];
        const translations =
          target.scope === 'message'
            ? message?.byId?.[target.message_id!]
            : message?.default;
        if (translations?.[target.locale] === undefined) {
          unchangedCount += 1;
          continue;
        }
        delete translations[target.locale];
        deletedCount += 1;
        cleanupOverride(overrides.messages, target);
      }
    },
  );
  return {
    deleted_count: deletedCount,
    unchanged_count: unchangedCount,
  };
}

function lockedTranslations(
  messages: LoadedProject['messages'],
  extracted: ExtractedMessage,
  target: TranslationTarget,
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

function cleanupOverride(
  messages: LoadedProject['overrides']['messages'],
  target: OverrideTarget,
): void {
  const message = messages[target.source];
  if (!message) return;
  if (target.scope === 'message') {
    const byId = message.byId?.[target.message_id!];
    if (byId && Object.keys(byId).length === 0) {
      delete message.byId![target.message_id!];
    }
    if (message.byId && Object.keys(message.byId).length === 0) {
      delete message.byId;
    }
  } else if (message.default && Object.keys(message.default).length === 0) {
    delete message.default;
  }
  if (!message.default && !message.byId) delete messages[target.source];
}

function setResult(
  targets: readonly ResolvedTarget<TranslationTarget>[],
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
