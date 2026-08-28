import { createMessageId, type TranslationOptions } from './message-id.js';
import { diagnosticMessage } from './diagnostics.js';
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
  /** @internal 由构建插件绑定静态调用点，应用代码不应直接调用。 */
  __aiI18nAt(occurrence: string): Translate;
}

export function createTranslate(
  lookup: (
    messageId: string,
    sourceFallback: string,
    occurrence?: string,
  ) => string,
): Translate {
  const scoped = new Map<string, Translate>();

  function create(occurrence?: string): Translate {
    const translateSource = (source: string, options?: TranslationOptions) => {
      const message = escapeTemplateLiteral(source);
      return formatTemplateMessage(
        lookup(createMessageId(message, options), message, occurrence),
        [],
      );
    };

    const translate = ((
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
          lookup(createMessageId(message), message, occurrence),
          values,
        );
      }
      if (values.length) {
        throw new TypeError(
          diagnosticMessage(
            '[ai-i18n] 翻译文案树只接收一个参数。',
            '[ai-i18n] Translating a message tree accepts exactly one argument.',
          ),
        );
      }
      return (
        translateMessageTree as unknown as (
          value: MessageTree,
          translate: (message: string) => string,
        ) => MessageTree
      )(source, translateSource);
    }) as Translate;
    Object.defineProperty(translate, '__aiI18nAt', {
      value: (key: string) => {
        const current = scoped.get(key);
        if (current) return current;
        const bound = create(key);
        scoped.set(key, bound);
        return bound;
      },
    });
    return translate;
  }

  return create();
}

function isTemplateStringsArray(
  value: TemplateStringsArray | MessageTree,
): value is TemplateStringsArray {
  return (
    Array.isArray(value) && Array.isArray((value as { raw?: unknown }).raw)
  );
}
