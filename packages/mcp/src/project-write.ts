import path from 'node:path';
import { hasSameTemplateTokens, type ExtractedMessage } from '@ai-i18n/core';
import {
  transactTranslationMemory,
  transactTranslationOverrides,
} from '@ai-i18n/core/translation-memory';
import { fail } from './errors.js';
import {
  decodeOverrideId,
  overrideTargetKey,
  type OverrideTarget,
} from './override-id.js';
import {
  cacheMessage,
  findExtracted,
  loadProject,
  type LoadedProject,
} from './project-files.js';
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

interface ResolvedTarget<T extends TranslationTarget> {
  input: T;
  message: ExtractedMessage;
}

export async function setTranslations(
  input: SetTranslationsInput,
): Promise<SetResult> {
  const project = await loadProject(input.i18n_directory);
  const targets = resolveTargets(project, input.updates, (target) =>
    [target.message_id, target.locale].join('\0'),
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
  await transactTranslationMemory(
    path.join(project.directory, 'translations.json'),
    (memory) => {
      const conflicts = targets.flatMap(({ input: update, message }) => {
        const translations = lockedTranslations(
          memory.messages,
          message,
          update,
        );
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
        const translations = lockedTranslations(
          memory.messages,
          message,
          update,
        );
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
    },
  );
  return setResult(input.updates, addedCount, overwrittenCount, unchangedCount);
}

export async function clearTranslations(
  input: ClearTranslationsInput,
): Promise<ClearResult> {
  const project = await loadProject(input.i18n_directory);
  const targets = resolveTargets(project, input.targets, (target) =>
    [target.message_id, target.locale].join('\0'),
  );
  let clearedCount = 0;
  let unchangedCount = 0;
  await transactTranslationMemory(
    path.join(project.directory, 'translations.json'),
    (memory) => {
      for (const { input: target, message } of targets) {
        const translations = lockedTranslations(
          memory.messages,
          message,
          target,
        );
        if ((translations[target.locale] ?? null) === null) {
          unchangedCount += 1;
        } else {
          translations[target.locale] = null;
          clearedCount += 1;
        }
      }
    },
  );
  return {
    cleared_count: clearedCount,
    unchanged_count: unchangedCount,
    affected_file_count: affectedFileCount(input.targets),
  };
}

export async function setOverrides(
  input: SetOverridesInput,
): Promise<SetResult> {
  const project = await loadProject(input.i18n_directory);
  const targets = resolveTargets(project, input.updates, (target, message) =>
    overrideTargetKey({
      scope: target.scope,
      source: message.source,
      ...(target.scope === 'message' ? { message_id: message.id } : {}),
      locale: target.locale,
    }),
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
  return setResult(input.updates, addedCount, overwrittenCount, unchangedCount);
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

function resolveTargets<T extends TranslationTarget>(
  project: LoadedProject,
  inputs: readonly T[],
  key: (input: T, message: ExtractedMessage) => string,
): Array<ResolvedTarget<T>> {
  const targets = inputs.map((input) => {
    const file = findExtracted(project, input.source_file);
    const message = file.messages.find((item) => item.id === input.message_id);
    if (!message) {
      fail('MESSAGE_NOT_FOUND', {
        ...targetDetails(input),
        next_tool: 'ai_i18n_list_translations',
      });
    }
    const cached = cacheMessage(project, message);
    if (!(input.locale in cached.translations)) {
      fail('UNKNOWN_LOCALE', {
        ...targetDetails(input),
        available_locales: Object.keys(cached.translations),
      });
    }
    return { input, message };
  });
  rejectDuplicateTargets(targets, (target) =>
    key(target.input, target.message),
  );
  return targets;
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
  updates: readonly TranslationTarget[],
  addedCount: number,
  overwrittenCount: number,
  unchangedCount: number,
): SetResult {
  return {
    added_count: addedCount,
    overwritten_count: overwrittenCount,
    unchanged_count: unchangedCount,
    affected_file_count: affectedFileCount(updates),
  };
}

function affectedFileCount(items: readonly TranslationTarget[]): number {
  return new Set(items.map((item) => item.source_file)).size;
}

function targetDetails(target: TranslationTarget): Record<string, string> {
  return {
    source_file: target.source_file,
    message_id: target.message_id,
    locale: target.locale,
  };
}
