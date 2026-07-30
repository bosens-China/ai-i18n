import { createMessageId, type ExtractedMessage } from '@ai-i18n/core';
import { fail } from './errors.js';
import { cacheMessage, type LoadedProject } from './project-files.js';
import type { MessageReference, TranslationTarget } from './project.js';

export interface ResolvedTarget<T extends TranslationTarget> {
  input: T;
  message: ExtractedMessage;
  sourceFiles: string[];
}

export function resolveTargets<T extends TranslationTarget>(
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
      fail('MESSAGE_NOT_FOUND', {
        ...targetDetails(input),
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

export function deduplicateTargets<T extends TranslationTarget>(
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
  targets: readonly ResolvedTarget<TranslationTarget>[],
): number {
  return new Set(targets.flatMap((target) => target.sourceFiles)).size;
}

export function sourceFilesForSource(
  project: LoadedProject,
  source: string,
): string[] {
  const files = new Set<string>();
  for (const file of project.extracted) {
    if (file.messages.some((message) => message.source === source)) {
      files.add(file.source);
    }
  }
  return [...files].sort();
}

export function targetDetails(
  target: TranslationTarget,
): Record<string, unknown> {
  return {
    message: target.message,
    locale: target.locale,
  };
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
