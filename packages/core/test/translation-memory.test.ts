import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  readTranslationOverrides,
  transactTranslationOverrides,
} from '../src/translation-memory';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test('serializes concurrent translation override updates with the in-process queue', async () => {
  const directory = await temporaryDirectory();
  const file = path.join(directory, 'overrides');

  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      transactTranslationOverrides(file, (overrides) => {
        overrides.rules.push({
          source: `消息-${index}`,
          translations: { 'en-US': index === 0 ? '' : `Message ${index}` },
        });
      }),
    ),
  );

  const overrides = await readTranslationOverrides(file);
  expect(overrides.rules).toHaveLength(20);
  expect(
    overrides.rules.find((rule) => rule.source === '消息-0'),
  ).toMatchObject({ translations: { 'en-US': '' } });
});

test('allows the next queued update after a failed update', async () => {
  const directory = await temporaryDirectory();
  const failed = transactTranslationOverrides(directory, () => {
    throw new Error('invalid update');
  });
  const next = transactTranslationOverrides(directory, (overrides) => {
    overrides.rules.push({ source: '保存', translations: { en: 'Save' } });
  });
  await expect(failed).rejects.toThrow('invalid update');
  await next;
  expect((await readTranslationOverrides(directory)).rules).toHaveLength(1);
});

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-memory-'));
  directories.push(directory);
  return directory;
}
