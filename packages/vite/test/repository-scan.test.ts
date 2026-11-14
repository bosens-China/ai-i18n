import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test, vi } from 'vitest';
import { aiI18n } from '../src/plugin.js';
import { scanProject } from '../src/scan.js';

test('explicit scan refreshes SQLite and locales without writing extracted shards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-scan-new-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    await fs.writeFile(
      path.join(root, 'index.html'),
      '<script type="module" src="/main.ts"></script>',
    );
    await fs.writeFile(
      path.join(root, 'main.ts'),
      `import { t } from 'virtual:ai-i18n'; console.log(t('首页'));`,
    );
    const adapter = vi.fn(async () => ({ 'en-US': { 首页: 'Home' } }));
    const result = await scanProject({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          adapter,
        }),
      ],
    });
    expect(result).toMatchObject({
      file_count: 1,
      message_count: 1,
      reused: false,
      locales: [{ locale: 'en-US', translated: 1, missing: 0 }],
    });
    expect(adapter).toHaveBeenCalledOnce();
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, 'i18n', 'locales', 'en-US.json'),
          'utf8',
        ),
      ),
    ).toEqual({ 首页: 'Home' });
    await fs.access(
      path.join(root, 'node_modules', '.cache', 'ai-i18n', 'extracted.sqlite'),
    );
    await expect(
      fs.access(path.join(root, 'i18n', 'extracted')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
