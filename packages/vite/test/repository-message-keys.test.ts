import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { RepositoryStore } from '../src/repository-store.js';
import {
  readManualLocale,
  writeManualLocale,
} from '../src/manual-translations.js';

it.each(['constructor', 'toString', '__proto__'])(
  'preserves the message key %s in manual and generated locales',
  async (key) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-key-'));
    try {
      const directory = path.join(root, 'i18n');
      const manual = Object.fromEntries([[key, 'Translated']]);
      await writeManualLocale(directory, 'en-US', 'global', manual);
      expect(
        Object.hasOwn(
          await readManualLocale(directory, 'en-US', 'global'),
          key,
        ),
      ).toBe(true);
      const store = new RepositoryStore(root);
      await store.rebuild(
        [
          {
            version: 1,
            source: 'src/a.ts',
            messages: [
              { id: key, source: key, locations: [{ line: 1, column: 0 }] },
            ],
          },
        ],
        'zh-CN',
        ['zh-CN', 'en-US'],
        {},
      );
      const output = JSON.parse(
        await fs.readFile(path.join(directory, 'locales/en-US.json'), 'utf8'),
      );
      expect(Object.hasOwn(output, key)).toBe(true);
      expect(output[key]).toBe('Translated');
      expect(Object.prototype).not.toHaveProperty('translations');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
