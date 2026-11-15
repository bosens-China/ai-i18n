import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { FileStore } from '../src/file-store.js';

test('repository mode does not write extraction or translation data during Dev sync', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-dev-'));
  try {
    const store = new FileStore({
      root,
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    await expect(fs.access(path.join(root, 'i18n'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(
      fs.access(
        path.join(
          root,
          'node_modules',
          '.cache',
          'ai-i18n',
          'extracted.sqlite',
        ),
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await store.close();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
