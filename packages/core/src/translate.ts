import { createMessageId, type TranslationOptions } from './message-id.js';
import {
  translateMessageTree,
  type MessageTree,
  type TranslatedMessageTree,
} from './message-tree.js';
import {
  createTemplateMessage,
  escapeTemplateLiteral,
  formatTemplateMessage,
} from './template.js';

export interface Translate {
  (source: string, options?: TranslationOptions): string;
  (strings: TemplateStringsArray, ...values: unknown[]): string;
  <T extends MessageTree>(messages: T): TranslatedMessageTree<T>;
}

export function createTranslate(
  lookup: (messageId: string, sourceFallback: string) => string,
): Translate {
  const translateSource = (source: string, options?: TranslationOptions) => {
    const message = escapeTemplateLiteral(source);
    return formatTemplateMessage(
      lookup(createMessageId(message, options), message),
      [],
    );
  };

  return ((
    source: string | TemplateStringsArray | MessageTree,
    ...values: unknown[]
  ) => {
    if (typeof source === 'string') {
      return translateSource(
        source,
        values[0] as TranslationOptions | undefined,
      );
    }
    if (isTemplateStringsArray(source)) {
      const message = createTemplateMessage(source);
      return formatTemplateMessage(
        lookup(createMessageId(message), message),
        values,
      );
    }
    if (values.length) {
      throw new TypeError(
        '[ai-i18n] 翻译文案树只接收一个参数 / Translating a message tree accepts exactly one argument.',
      );
    }
    return (
      translateMessageTree as unknown as (
        value: MessageTree,
        translate: (message: string) => string,
      ) => MessageTree
    )(source, translateSource);
  }) as Translate;
}

function isTemplateStringsArray(
  value: TemplateStringsArray | MessageTree,
): value is TemplateStringsArray {
  return (
    Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw)
  );
}
