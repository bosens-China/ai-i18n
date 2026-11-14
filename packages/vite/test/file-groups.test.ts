import { expect, test } from 'vitest';
import type { ExtractedFile } from '@ai-i18n/core';
import { buildFileGroups } from '../src/file-groups.js';
import { fileId } from '../src/repository-paths.js';

test('groups source files by output chunk and falls back to their directory', () => {
  const root = process.cwd();
  const files: ExtractedFile[] = ['src/a.ts', 'src/b.ts', 'src/other/c.ts'].map(
    (source) => ({
      version: 1,
      source,
      messages: [],
    }),
  );
  const groups = buildFileGroups(root, files, {
    entry: {
      type: 'chunk',
      fileName: 'assets/entry.js',
      modules: {
        [root + '/src/a.ts']: {},
        [root + '/src/b.ts']: {},
      },
    },
  });
  const a = groups[fileId(root, root + '/src/a.ts')];
  const b = groups[fileId(root, root + '/src/b.ts')];
  const c = groups[fileId(root, root + '/src/other/c.ts')];
  expect(a).toBe(b);
  expect(c).not.toBe(a);
  expect(a).toMatch(/^[a-f0-9]{12}$/);
});
