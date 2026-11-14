import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { expect, test, vi } from 'vitest';
import { aiI18n } from '../src/plugin.js';
import { aiI18nPluginApi } from '../src/plugin-api.js';
import { ensureScan } from '../src/scan-catalog.js';

test('Dev transforms file-scope calls without writing extraction data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-dev-new-'));
  try {
    await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(
      path.join(root, 'index.html'),
      '<script type="module" src="/src/main.ts"></script>',
    );
    await fs.writeFile(
      path.join(root, 'src', 'main.ts'),
      `import { t } from 'virtual:ai-i18n'; console.log(t('保存', { scope: 'file' }));`,
    );
    const plugin = aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      adapter: async () => null,
    });
    const server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true },
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [plugin],
    });
    try {
      const transformed = await server.transformRequest('/src/main.ts');
      expect(transformed?.code).toContain('__loadFile');
      await expect(
        fs.access(path.join(root, 'i18n', 'extracted')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
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
      const send = vi.spyOn(server.environments.client!.hot, 'send');
      await ensureScan(server, aiI18nPluginApi(plugin)!);
      expect(send).toHaveBeenCalledWith({ type: 'full-reload' });
    } finally {
      await server.close();
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
