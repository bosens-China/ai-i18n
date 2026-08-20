import {
  createMessageId,
  type LangOption,
  type ReviewMessageReference,
  type ReviewSourceLocation,
} from '@ai-i18n/core';
import type { ProjectSnapshot } from './project-state.js';
import type { ReviewOverrideTarget } from './review-service.js';
import { ReviewProblem } from './review-problem.js';

export function validateReviewTarget(
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
  if (!cache || !sameReviewMessage(cache, target.message)) {
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
  if (target.location && !target.file) {
    throw problem(
      'INVALID_SOURCE_LOCATION',
      400,
      '出现位置范围必须同时指定源码文件。',
      'An occurrence scope must include its source file.',
    );
  }
  if (
    target.file &&
    target.location &&
    !messageAppearsAt(snapshot, messageId, target.file, target.location)
  ) {
    const label = `${target.file}:${target.location.line}:${target.location.column + 1}`;
    throw problem(
      'UNKNOWN_SOURCE_LOCATION',
      400,
      `目标文案未出现在“${label}”。`,
      `The target message does not occur at "${label}".`,
    );
  }
}

export function sameReviewMessage(
  left: ReviewMessageReference,
  right: ReviewMessageReference,
): boolean {
  return (
    left.source === right.source &&
    (left.comment ?? undefined) === (right.comment ?? undefined)
  );
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

function messageAppearsAt(
  snapshot: ProjectSnapshot,
  messageId: string,
  sourceFile: string,
  location: ReviewSourceLocation,
): boolean {
  return Boolean(
    snapshot.extracted[sourceFile]?.messages.some(
      (message) =>
        message.id === messageId &&
        message.locations.some(
          (candidate) =>
            candidate.line === location.line &&
            candidate.column === location.column,
        ),
    ),
  );
}

function problem(
  code: string,
  status: number,
  zh: string,
  en: string,
): ReviewProblem {
  return new ReviewProblem(code, status, zh, en);
}
