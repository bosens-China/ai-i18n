import {
  atomicOverrideKey,
  atomicOverrides,
  hasSameTemplateTokens,
  overridesFromAtomic,
  type AtomicOverride,
  type ExtractedFile,
  type LangOption,
  type ReviewMessage,
  type ReviewMessageReference,
  type ReviewOccurrence,
  type ReviewOverride,
  type ReviewSnapshot,
  type ReviewSourceLocation,
  type TranslationMemoryFile,
  type TranslationOverridesFile,
} from '@ai-i18n/core';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { FileStore } from './file-store.js';
import type { ProjectSnapshot, ProjectState } from './project-state.js';
import { ReviewProblem } from './review-problem.js';
import {
  sameReviewMessage,
  validateReviewTarget,
} from './review-target-validation.js';

export interface ReviewOverrideTarget {
  message: ReviewMessageReference;
  locale: string;
  file?: string;
  location?: ReviewSourceLocation;
}

export interface ReviewOverrideUpdate extends ReviewOverrideTarget {
  value: string;
}

export interface ReviewMutationResult {
  changed: boolean;
  affectedModuleCount: number;
}

export { ReviewProblem } from './review-problem.js';

interface ReviewServiceOptions {
  sourceLang: string;
  locales: readonly LangOption[];
  ready: () => Promise<void>;
  state: () => ProjectState;
  store: () => FileStore;
  loadPersistedExtracted?: () => Promise<readonly ExtractedFile[]>;
  persistedCache?: () => TranslationMemoryFile | undefined;
  runStateTask: DevStateTaskRunner;
  flushPersistence: () => Promise<void>;
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
  let persistedExtracted: Promise<readonly ExtractedFile[]> | undefined;

  function loadPersistedExtracted(): Promise<readonly ExtractedFile[]> {
    return (persistedExtracted ??=
      options.loadPersistedExtracted?.() ?? Promise.resolve([]));
  }

  async function projectSnapshot(): Promise<ProjectSnapshot> {
    const snapshot = options.state().snapshot();
    const persisted = await loadPersistedExtracted();
    if (!persisted.length) return snapshot;

    // 已在 Dev 转换过的模块始终以实时分析结果为准，也要遮蔽旧快照中的空提取记录。
    const seen = new Set(snapshot.seen);
    const extracted = Object.fromEntries(
      persisted
        .filter((file) => !seen.has(file.source))
        .map((file) => [file.source, file]),
    );
    return {
      ...snapshot,
      cache: {
        ...snapshot.cache,
        messages: {
          ...options.persistedCache?.()?.messages,
          ...snapshot.cache.messages,
        },
      },
      extracted: { ...extracted, ...snapshot.extracted },
    };
  }

  async function snapshot(): Promise<ReviewSnapshot> {
    await options.ready();
    return createReviewSnapshot(
      await projectSnapshot(),
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
      await options.flushPersistence();
      const project = options.state();
      const store = options.store();
      const snapshot = await projectSnapshot();
      validateReviewTarget(
        snapshot,
        target,
        options.sourceLang,
        options.locales,
      );
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
          ...(target.location ? { location: target.location } : {}),
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
            ...(target.location ? { location: target.location } : {}),
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
              sameReviewMessage(entry, message) &&
              (!entry.file || sourceFiles.has(entry.file)) &&
              (!entry.location ||
                messageOccursAt(
                  messageOccurrences,
                  entry.file!,
                  entry.location,
                )),
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

function messageOccursAt(
  occurrences: readonly ReviewOccurrence[],
  sourceFile: string,
  location: ReviewSourceLocation,
): boolean {
  return occurrences.some(
    (occurrence) =>
      occurrence.sourceFile === sourceFile &&
      occurrence.locations.some(
        (candidate) =>
          candidate.line === location.line &&
          candidate.column === location.column,
      ),
  );
}

function toReviewOverride(entry: AtomicOverride): ReviewOverride {
  return {
    locale: entry.locale,
    value: entry.value,
    ...(entry.file ? { file: entry.file } : {}),
    ...(entry.location ? { location: { ...entry.location } } : {}),
  };
}

function compareOverrides(left: ReviewOverride, right: ReviewOverride): number {
  const leftKey = JSON.stringify([
    left.locale,
    left.location ? 2 : left.file ? 1 : 0,
    left.file,
    left.location?.line,
    left.location?.column,
  ]);
  const rightKey = JSON.stringify([
    right.locale,
    right.location ? 2 : right.file ? 1 : 0,
    right.file,
    right.location?.line,
    right.location?.column,
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
