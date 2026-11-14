import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { ExtractedFile } from '@ai-i18n/core';
import { ExtractionIndex } from '../src/extraction-index.js';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('isolates apps and rolls back a failed complete snapshot', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-index-'));
  roots.push(root);
  await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
  const first = new ExtractionIndex(path.join(root, 'apps/first'));
  const second = new ExtractionIndex(path.join(root, 'apps/second'));
  const message = (source: string): ExtractedFile => ({
    version: 1,
    source,
    messages: [],
  });

  first.write({ 'src/a.ts': message('src/a.ts') }, [], true);
  second.write({ 'src/b.ts': message('src/b.ts') }, [], true);
  expect(first.load()).toEqual([message('src/a.ts')]);
  expect(second.load()).toEqual([message('src/b.ts')]);

  const cyclic = message('src/bad.ts') as ExtractedFile & { self?: unknown };
  cyclic.self = cyclic;
  expect(() => first.write({ 'src/bad.ts': cyclic }, [], true)).toThrow();
  expect(first.load()).toEqual([message('src/a.ts')]);

  const scoped = message('src/c.ts');
  scoped.messages.push({
    id: '保存',
    source: '保存',
    scope: 'file',
    locations: [],
  });
  first.write({ 'src/c.ts': scoped }, [], true);
  expect(first.load()).toEqual([scoped]);
  expect(second.load()).toEqual([message('src/b.ts')]);
  await expect(
    fs.access(path.join(root, 'i18n/extracted')),
  ).rejects.toMatchObject({
    code: 'ENOENT',
  });
});
