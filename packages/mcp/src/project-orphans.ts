import path from 'node:path';
import { transactTranslationMemory } from '@ai-i18n/core/translation-memory';
import { fail } from './errors.js';
import { createOrphanId, validateOrphanId } from './orphan-id.js';
import { paginate } from './pagination.js';
import {
  filterTranslations,
  loadProject,
  validateLocales,
  type LoadedProject,
} from './project-files.js';
import type {
  DeleteOrphanMessagesInput,
  DeleteResult,
  ListOrphanMessagesInput,
  OrphanMessageListResult,
} from './project.js';

const RESPONSE_CHARACTER_LIMIT = 100_000;

export async function listOrphanMessages(
  input: ListOrphanMessagesInput,
): Promise<OrphanMessageListResult> {
  const project = await loadProject(input.i18n_directory);
  validateLocales(project, input.locales);
  const active = activeMessageIds(project);
  const items = Object.entries(project.messages)
    .filter(([messageId]) => !active.has(messageId))
    .map(([messageId, message]) => ({
      orphan_id: createOrphanId(messageId),
      message: {
        source: message.source,
        ...(message.comment ? { comment: message.comment } : {}),
      },
      translations: filterTranslations(message.translations, input.locales),
    }))
    .sort((left, right) =>
      left.orphan_id < right.orphan_id
        ? -1
        : left.orphan_id > right.orphan_id
          ? 1
          : 0,
    );
  return paginate(
    items,
    (item) => item.orphan_id,
    input.limit,
    input.cursor,
    RESPONSE_CHARACTER_LIMIT,
  );
}

export async function deleteOrphanMessages(
  input: DeleteOrphanMessagesInput,
): Promise<DeleteResult> {
  const project = await loadProject(input.i18n_directory);
  const orphanIds = input.orphan_ids.map(validateOrphanId);
  rejectDuplicateOrphanIds(orphanIds);
  const active = activeMessageIds(project);
  let deletedCount = 0;
  let unchangedCount = 0;
  await transactTranslationMemory(
    path.join(project.directory, 'translations.json'),
    (memory) => {
      const messagesByOrphanId = indexMessagesByOrphanId(memory.messages);
      const reactivated = orphanIds.filter((orphanId) => {
        const messageId = messagesByOrphanId.get(orphanId);
        return messageId !== undefined && active.has(messageId);
      });
      // 整批先复验，避免一部分消息删除后才发现另一部分已重新被源码引用。
      if (reactivated.length) {
        fail('ORPHAN_MESSAGE_REACTIVATED', {
          orphan_ids: reactivated,
        });
      }
      for (const orphanId of orphanIds) {
        const messageId = messagesByOrphanId.get(orphanId);
        if (messageId === undefined) {
          unchangedCount += 1;
          continue;
        }
        delete memory.messages[messageId];
        deletedCount += 1;
      }
    },
  );
  return {
    deleted_count: deletedCount,
    unchanged_count: unchangedCount,
  };
}

function activeMessageIds(project: LoadedProject): Set<string> {
  return new Set(
    project.extracted.flatMap((file) =>
      file.messages.map((message) => message.id),
    ),
  );
}

function indexMessagesByOrphanId(
  messages: LoadedProject['messages'],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const messageId of Object.keys(messages)) {
    const orphanId = createOrphanId(messageId);
    if (result.has(orphanId)) {
      fail('ORPHAN_ID_CONFLICT', { orphan_id: orphanId });
    }
    result.set(orphanId, messageId);
  }
  return result;
}

function rejectDuplicateOrphanIds(orphanIds: readonly string[]): void {
  const seen = new Set<string>();
  for (const orphanId of orphanIds) {
    if (seen.has(orphanId)) {
      fail('DUPLICATE_TARGET', { target: orphanId });
    }
    seen.add(orphanId);
  }
}
