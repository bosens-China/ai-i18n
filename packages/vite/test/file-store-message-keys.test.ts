import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { setup } from './file-store-test-utils';
import { updateTestTranslationMemory } from './translation-memory-test-utils';

describe('Translation Memory message keys', () => {
  it.each(['constructor', 'toString', '__proto__'])(
    'extracts, commits and reloads %s as an own message',
    async (text) => {
      const { root, state, store } = await setup();
      const source = path.join(root, 'src/main.ts');
      const code = `import { t } from 'virtual:ai-i18n'; t(${JSON.stringify(text)})`;
      await fs.writeFile(source, code);
      state.update(code, source);
      const snapshot = state.snapshot();
      expect(Object.hasOwn(snapshot.cache.messages, text)).toBe(true);
      await store.sync(snapshot);
      const first = await store.load();
      expect(Object.hasOwn(first.messages, text)).toBe(true);
      expect(first.messages[text]).toMatchObject({
        source: text,
        translations: { 'en-US': null },
      });
      await updateTestTranslationMemory(store.directory, (draft) => {
        draft.messages[text]!.translations['en-US'] = 'Translated';
      });
      const next = await store.sync(snapshot);
      expect(next.messages[text]!.translations['en-US']).toBe('Translated');
      expect((await store.load()).messages[text]!.translations['en-US']).toBe(
        'Translated',
      );
      expect(Object.prototype).not.toHaveProperty('translations');
      expect(Object).not.toHaveProperty('translations');
    },
  );
});
