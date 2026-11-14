import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  manualLocalePath,
  readManualLocale,
} from '../src/manual-translations.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('reads separate global and file manual dictionaries, including empty translations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-manual-'));
  roots.push(root);
  const global = manualLocalePath(root, 'en-US', 'global');
  const file = manualLocalePath(root, 'en-US', 'file');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(global, JSON.stringify({ 保存: 'Save', 清空: '' }));
  await fs.writeFile(file, JSON.stringify({ 'f:123:保存': 'Save file' }));

  expect(await readManualLocale(root, 'en-US', 'global')).toEqual({
    保存: 'Save',
    清空: '',
  });
  expect(await readManualLocale(root, 'en-US', 'file')).toEqual({
    'f:123:保存': 'Save file',
  });
  expect(await readManualLocale(root, 'ja-JP', 'global')).toEqual({});

  await fs.writeFile(global, JSON.stringify({ 保存: null }));
  await expect(readManualLocale(root, 'en-US', 'global')).rejects.toThrow(
    /人工译文|Manual translation/,
  );
});
