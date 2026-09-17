import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import {
  DuplicateJsonKeyError,
  parseProtocolJson,
} from '@ai-i18n/core/translation-memory';
import { setup } from './file-store-test-utils';
import { extractedTestPath } from './extracted-test-path';
import { readJson } from '../src/json-files';
import { writeProtocolJson } from '../src/file-store-io';

it('cleans equal duplicates through ordinary Vite persistence without Build', async () => {
  const { root, state, store } = await setup();
  const source = path.join(root, 'src/main.ts');
  const code = "import { t } from 'virtual:ai-i18n'; console.log(t('保存'));";
  await fs.writeFile(source, code);
  state.update(code, source);
  await store.sync(state.snapshot());
  const extracted = extractedTestPath(root, 'src/main.ts');
  const locale = path.join(root, 'i18n/locales/en-US.json');
  const translations = path.join(root, 'i18n/translations');
  const bucket = path.join(
    translations,
    (await fs.readdir(translations, { recursive: true })).find((file) =>
      file.endsWith('.json'),
    )!,
  );
  for (const file of [extracted, locale, bucket]) {
    const raw = (await fs.readFile(file, 'utf8')).replace(
      '"version": 1',
      '"version": 1, "version": 1',
    );
    await fs.writeFile(file, raw);
    await readJson(file);
    expect(await fs.readFile(file, 'utf8')).toBe(raw);
  }
  await store.sync(state.snapshot());
  for (const file of [extracted, locale, bucket]) {
    expect(
      parseProtocolJson(await fs.readFile(file, 'utf8'), file).duplicateCount,
    ).toBe(0);
  }
  await store.close();
});

it('blocks generated-file replacement when existing keys conflict', async () => {
  const { root, store } = await setup();
  const file = path.join(root, 'source.json');
  const raw = '{"messages":{"key":"First","key":"Last"}}';
  await fs.writeFile(file, raw);
  await expect(readJson(file)).rejects.toBeInstanceOf(DuplicateJsonKeyError);
  await expect(
    writeProtocolJson(file, { messages: { key: 'New' } }),
  ).rejects.toBeInstanceOf(DuplicateJsonKeyError);
  expect(await fs.readFile(file, 'utf8')).toBe(raw);
  await store.close();
});
