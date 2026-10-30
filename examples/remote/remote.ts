import { defineRemote } from '@ai-i18n/vite/remote';
import { messageKey } from './server/catalog.js';

export function createRemote(
  origin: string,
  mode: 'replace' | 'overlay' = 'replace',
) {
  return defineRemote({
    mode,
    async publish({ messages, signal }) {
      const response = await fetch(`${origin}/api/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: messages.map(messageKey) }),
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    async load({ messages, signal }) {
      const response = await fetch(`${origin}/api/locales/en.json`, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== 'object' ||
        !('version' in data) ||
        typeof data.version !== 'string' ||
        !('messages' in data) ||
        !data.messages ||
        typeof data.messages !== 'object' ||
        Array.isArray(data.messages)
      ) {
        throw new Error('Invalid remote snapshot');
      }
      const dictionary = data.messages as Record<string, unknown>;
      return {
        translations: messages.flatMap((message) => {
          const key = messageKey(message);
          if (!Object.hasOwn(dictionary, key)) return [];
          const value = dictionary[key];
          if (typeof value !== 'string')
            throw new Error('Invalid remote translation');
          return [{ message, locale: 'en-US', value }];
        }),
        publicMeta: { version: data.version, service: 'Hono', mode },
      };
    },
  });
}
