import {
  atomicOverrideKey,
  atomicOverrides,
  createMessageId,
  hasSameTemplateTokens,
  overridesFromAtomic,
  type AtomicOverride,
  type LangOption,
  type ReviewMessage,
  type ReviewMessageReference,
  type ReviewMutation,
  type ReviewOccurrence,
  type ReviewOverride,
  type ReviewSnapshot,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { FileStore } from './file-store.js';
import type { ProjectSnapshot, ProjectState } from './project-state.js';

export interface ReviewOverrideTarget {
  message: ReviewMessageReference;
  locale: string;
  file?: string;
}

export interface ReviewOverrideUpdate extends ReviewOverrideTarget {
  value: string;
}

type ReviewMessageLike =
  ReviewMessageReference | AtomicOverride | ReviewMutation['message'];

export interface ReviewMutationResult {
  changed: boolean;
  affectedModuleCount: number;
}

export interface ReviewProblemShape {
  code: string;
  status: number;
  zh: string;
  en: string;
}

export class ReviewProblem extends Error implements ReviewProblemShape {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly zh: string,
    readonly en: string,
  ) {
    super(en);
  }
}

interface ReviewServiceOptions {
  sourceLang: string;
  locales: readonly LangOption[];
  ready: () => Promise<void>;
  state: () => ProjectState;
  store: () => FileStore;
  runStateTask: DevStateTaskRunner;
  notify: (affectedModuleIds: string[], locale: string) => void;
}

export interface ReviewService {
  snapshot(): Promise<ReviewSnapshot>;
  setOverride(update: ReviewOverrideUpdate): Promise<ReviewMutationResult>;
  deleteOverride(target: ReviewOverrideTarget): Promise<ReviewMutationResult>;
}

export function createReviewService(
  options: ReviewServiceOptions,
): ReviewService {
  async function snapshot(): Promise<ReviewSnapshot> {
    await options.ready();
    return createReviewSnapshot(
      options.state().snapshot(),
      await options.store().loadOverrides(),
      options.sourceLang,
      options.locales,
    );
  }

  async function mutate(
    target: ReviewOverrideTarget,
    value: string | undefined,
  ): Promise<ReviewMutationResult> {
    await options.ready();
    return options.runStateTask(async () => {
      const project = options.state();
      const store = options.store();
      const snapshot = project.snapshot();
      validateTarget(snapshot, target, options.sourceLang, options.locales);
      if (
        value !== undefined &&
        !hasSameTemplateTokens(target.message.source, value)
      ) {
        throw problem(
          'TEMPLATE_TOKEN_MISMATCH',
          400,
          '人工译文必须保留原文中的全部模板占位符。',
          'The reviewed translation must preserve every template token from the source.',
        );
      }

      let changed = false;
      const overrides = await store.transactOverrides((draft) => {
        const entries = atomicOverrides(draft);
        const key = atomicOverrideKey({
          source: target.message.source,
          ...(target.message.comment
            ? { comment: target.message.comment }
            : {}),
          ...(target.file ? { file: target.file } : {}),
          locale: target.locale,
        });
        const current = entries.get(key);
        if (value === undefined) {
          changed = entries.delete(key);
        } else if (current?.value !== value) {
          entries.set(key, {
            source: target.message.source,
            ...(target.message.comment
              ? { comment: target.message.comment }
              : {}),
            ...(target.file ? { file: target.file } : {}),
            locale: target.locale,
            value,
          });
          changed = true;
        }
        draft.rules = overridesFromAtomic(entries.values()).rules;
      });
      if (!changed) return { changed: false, affectedModuleCount: 0 };

      const affected = project.hydrateOverrides(overrides);
      const cache = await store.sync(project.snapshot());
      project.hydrateCache(cache);
      options.notify(affected, target.locale);
      return { changed: true, affectedModuleCount: affected.length };
    });
  }

  return {
    snapshot,
    setOverride: (update) => mutate(update, update.value),
    deleteOverride: (target) => mutate(target, undefined),
  };
}

export function createReviewSnapshot(
  snapshot: ProjectSnapshot,
  overrides: TranslationOverridesFile,
  sourceLang: string,
  locales: readonly LangOption[],
): ReviewSnapshot {
  const targetLocales = locales.filter((locale) => locale.value !== sourceLang);
  const occurrences = collectOccurrences(snapshot);
  const overrideEntries = [...atomicOverrides(overrides).values()];
  const messages = [...occurrences.entries()]
    .map(([messageId, messageOccurrences]) => {
      const cache = snapshot.cache.messages[messageId];
      if (!cache) return undefined;
      const message = {
        source: cache.source,
        ...(cache.comment ? { comment: cache.comment } : {}),
      };
      const sourceFiles = new Set(
        messageOccurrences.map((occurrence) => occurrence.sourceFile),
      );
      return {
        message,
        translations: Object.fromEntries(
          targetLocales.map((locale) => [
            locale.value,
            cache.translations[locale.value] ?? null,
          ]),
        ),
        overrides: overrideEntries
          .filter(
            (entry) =>
              sameMessage(entry, message) &&
              (!entry.file || sourceFiles.has(entry.file)),
          )
          .map(toReviewOverride)
          .sort(compareOverrides),
        occurrences: messageOccurrences,
      } satisfies ReviewMessage;
    })
    .filter((message) => message !== undefined)
    .sort((left, right) =>
      messageKey(left.message) < messageKey(right.message)
        ? -1
        : messageKey(left.message) > messageKey(right.message)
          ? 1
          : 0,
    );
  return {
    sourceLang,
    locales: targetLocales.map((locale) => ({ ...locale })),
    messages,
  };
}

function collectOccurrences(
  snapshot: ProjectSnapshot,
): Map<string, ReviewOccurrence[]> {
  const occurrences = new Map<string, ReviewOccurrence[]>();
  for (const file of Object.values(snapshot.extracted)) {
    for (const message of file.messages) {
      const items = occurrences.get(message.id) ?? [];
      items.push({
        sourceFile: file.source,
        locations: message.locations.map((location) => ({ ...location })),
      });
      occurrences.set(message.id, items);
    }
  }
  for (const items of occurrences.values()) {
    items.sort((left, right) =>
      left.sourceFile < right.sourceFile
        ? -1
        : left.sourceFile > right.sourceFile
          ? 1
          : 0,
    );
  }
  return occurrences;
}

function validateTarget(
  snapshot: ProjectSnapshot,
  target: ReviewOverrideTarget,
  sourceLang: string,
  locales: readonly LangOption[],
): void {
  if (
    !locales.some(
      (locale) => locale.value === target.locale && locale.value !== sourceLang,
    )
  ) {
    throw problem(
      'UNKNOWN_LOCALE',
      400,
      `目标语言“${target.locale}”不属于当前 Vite 应用。`,
      `Target locale "${target.locale}" does not belong to this Vite application.`,
    );
  }
  const messageId = createMessageId(
    target.message.source,
    target.message.comment ? { comment: target.message.comment } : undefined,
  );
  const cache = snapshot.cache.messages[messageId];
  if (!cache || !sameMessage(cache, target.message)) {
    throw problem(
      'UNKNOWN_MESSAGE',
      404,
      '目标文案已不存在，请刷新校对页面后重试。',
      'The target message no longer exists. Refresh the review console and try again.',
    );
  }
  if (target.file && !messageAppearsIn(snapshot, messageId, target.file)) {
    throw problem(
      'UNKNOWN_SOURCE_FILE',
      400,
      `目标文案未出现在文件“${target.file}”中。`,
      `The target message does not occur in "${target.file}".`,
    );
  }
}

function messageAppearsIn(
  snapshot: ProjectSnapshot,
  messageId: string,
  sourceFile: string,
): boolean {
  return Boolean(
    snapshot.extracted[sourceFile]?.messages.some(
      (message) => message.id === messageId,
    ),
  );
}

function sameMessage(
  left: ReviewMessageLike,
  right: ReviewMessageLike,
): boolean {
  return (
    left.source === right.source &&
    (left.comment ?? undefined) === (right.comment ?? undefined)
  );
}

function toReviewOverride(entry: AtomicOverride): ReviewOverride {
  return {
    locale: entry.locale,
    value: entry.value,
    ...(entry.file ? { file: entry.file } : {}),
  };
}

function compareOverrides(left: ReviewOverride, right: ReviewOverride): number {
  const leftKey = JSON.stringify([left.locale, left.file ? 1 : 0, left.file]);
  const rightKey = JSON.stringify([
    right.locale,
    right.file ? 1 : 0,
    right.file,
  ]);
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function messageKey(message: ReviewMessageReference): string {
  return JSON.stringify([message.source, message.comment ?? null]);
}

function problem(
  code: string,
  status: number,
  zh: string,
  en: string,
): ReviewProblem {
  return new ReviewProblem(code, status, zh, en);
}
