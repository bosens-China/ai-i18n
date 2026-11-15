import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { DuplicateJsonKeyError } from '@ai-i18n/core/internal/files';
import { setup } from './file-store-test-utils';
import { readJson } from '../src/json-files';
import { writeProtocolJson } from '../src/file-store-io';

it('rejects conflicting duplicate keys without changing manual input', async () => {
  const { root } = await setup();
  const file = path.join(root, 'i18n/locales/en-US.manual.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const raw = '{"保存":"Save","保存":"Store"}';
  await fs.writeFile(file, raw);
  const { readManualLocale } = await import('../src/manual-translations');
  await expect(
    readManualLocale(path.join(root, 'i18n'), 'en-US', 'global'),
  ).rejects.toBeInstanceOf(DuplicateJsonKeyError);
  expect(await fs.readFile(file, 'utf8')).toBe(raw);
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
