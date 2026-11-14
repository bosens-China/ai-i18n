import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import type { ExtractedFile } from '@ai-i18n/core';
import { buildTranslationCatalog } from '../src/translation-catalog.js';

test('deduplicates global messages and keeps file identity without path in the key', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-catalog-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    const files: ExtractedFile[] = [
      {
        version: 1,
        source: 'src/a.ts',
        messages: [
          {
            id: '保存#按钮',
            source: '保存',
            comment: '按钮',
            scope: 'file',
            locations: [],
          },
        ],
      },
      {
        version: 1,
        source: 'src/b.ts',
        messages: [
          { id: '保存#按钮', source: '保存', comment: '按钮', locations: [] },
        ],
      },
    ];
    const catalog = buildTranslationCatalog(
      root,
      'zh-CN',
      ['zh-CN', 'en-US'],
      files,
    );
    expect(catalog.messages).toHaveLength(2);
    expect(catalog.messages).toEqual(
      expect.arrayContaining([
        { key: '保存#按钮', source: '保存', comment: '按钮', scope: 'global' },
        expect.objectContaining({
          key: expect.stringMatching(/^f:[0-9a-f]{16}:保存#按钮$/),
          scope: 'file',
          file: expect.objectContaining({ path: 'src/a.ts' }),
        }),
      ]),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
