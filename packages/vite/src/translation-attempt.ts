import type { ExtractedMessage } from './yuku-analyzer.js';

export function translationAttemptKey(
  message: Pick<ExtractedMessage, 'id' | 'source' | 'comment'>,
  locale: string,
): string {
  return JSON.stringify([
    message.id,
    message.source,
    message.comment ?? '',
    locale,
  ]);
}

export function translationAttemptFieldKey(
  messageId: string,
  locale: string,
): string {
  return `${messageId}\0${locale}`;
}
