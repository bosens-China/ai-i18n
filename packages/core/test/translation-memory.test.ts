import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  readTranslationOverrides,
  readTranslationMemory,
  transactTranslationOverrides,
  transactTranslationMemory,
} from '../src/translation-memory';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test('serializes concurrent field updates and advances revision per commit', async () => {
  const directory = await temporaryDirectory();
  const file = path.join(directory, 'translations.json');

  await Promise.all(
    Array.from({ length: 40 }, (_, index) =>
      transactTranslationMemory(file, (memory) => {
        memory.messages[`message-${index}`] = {
          sourceLang: 'zh-CN',
          translations: { 'en-US': `translation-${index}` },
        };
      }),
    ),
  );

  const memory = await readTranslationMemory(file);
  expect(Object.keys(memory.messages)).toHaveLength(40);
  expect(memory.revision).toBe(40);
});

test('does not rewrite an unchanged current memory', async () => {
  const directory = await temporaryDirectory();
  const file = path.join(directory, 'translations.json');
  const created = await transactTranslationMemory(file, (memory) => {
    memory.messages.保存 = {
      sourceLang: 'zh-CN',
      translations: { 'en-US': 'Save' },
    };
  });
  const unchanged = await transactTranslationMemory(file, () => undefined);

  expect(created).toMatchObject({
    version: 1,
    revision: 1,
    messages: { 保存: { translations: { 'en-US': 'Save' } } },
  });
  expect(unchanged.revision).toBe(1);
});

test('serializes concurrent translation override updates with the shared lock', async () => {
  const directory = await temporaryDirectory();
  const file = path.join(directory, 'overrides.json');

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      transactTranslationOverrides(file, (overrides) => {
        overrides.messages[`消息-${index}`] = {
          default: { 'en-US': index === 0 ? '' : `Message ${index}` },
        };
      }),
    ),
  );

  const overrides = await readTranslationOverrides(file);
  expect(Object.keys(overrides.messages)).toHaveLength(20);
  expect(overrides.messages['消息-0']?.default?.['en-US']).toBe('');
});

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-memory-'));
  directories.push(directory);
  return directory;
}
