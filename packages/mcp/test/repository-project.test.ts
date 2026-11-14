import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from 'vitest';
import { ExtractionIndex, fileId } from '@ai-i18n/vite/internal/repository';
import {
  editRepositoryTranslations,
  listRepositoryTranslations,
} from '../src/repository-project.js';

test('lists active identities and edits only manual key-value JSON', async () => {
  const root = await fs.mkdtemp(
    path.resolve('packages/mcp/node_modules/.repository-test-'),
  );
  try {
    await fs.mkdir(path.join(root, 'node_modules', '@ai-i18n'), {
      recursive: true,
    });
    await fs.symlink(
      path.resolve('packages/vite'),
      path.join(root, 'node_modules', '@ai-i18n', 'vite'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await fs.writeFile(
      path.join(root, 'ai-i18n.config.ts'),
      `export default { sourceLang: 'zh-CN', locales: [{ value: 'zh-CN', label: '中文' }, { value: 'en-US', label: 'English' }] };`,
    );
    const id = fileId(root, path.join(root, 'src', 'page.ts'));
    new ExtractionIndex(root).write(
      {
        'src/page.ts': {
          version: 1,
          source: 'src/page.ts',
          messages: [
            {
              id: '保存',
              source: '保存',
              scope: 'file',
              locations: [{ line: 1, column: 0 }],
            },
            {
              id: '取消',
              source: '取消',
              locations: [{ line: 2, column: 0 }],
            },
          ],
        },
      },
      [],
      true,
    );
    await fs.mkdir(path.join(root, 'i18n', 'locales'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'i18n', 'locales', 'en-US.json'),
      JSON.stringify({ 保存: 'Save' }),
    );
    const config_file = path.join(root, 'ai-i18n.config.ts');
    const first = await listRepositoryTranslations({
      config_file,
      locale: 'en-US',
      view: 'all',
    });
    expect(first.items).toHaveLength(3);
    expect(first.items.find((item) => item.key === `f:${id}:保存`)?.value).toBe(
      'Save',
    );
    const result = await editRepositoryTranslations({
      config_file,
      locale: 'en-US',
      updates: [{ key: `f:${id}:保存`, value: 'Save here' }],
    });
    expect(result).toEqual({ changed_count: 1, rebuild_required: true });
    const second = await listRepositoryTranslations({
      config_file,
      locale: 'en-US',
      view: 'all',
    });
    expect(
      second.items.find((item) => item.key === `f:${id}:保存`)?.value,
    ).toBe('Save here');
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, 'i18n', 'locales', 'files', 'en-US.manual.json'),
          'utf8',
        ),
      ),
    ).toEqual({ [`f:${id}:保存`]: 'Save here' });
    await editRepositoryTranslations({
      config_file,
      locale: 'en-US',
      updates: [{ key: `f:${id}:保存`, value: null }],
    });
    const third = await listRepositoryTranslations({
      config_file,
      locale: 'en-US',
      view: 'all',
    });
    expect(third.items.find((item) => item.key === `f:${id}:保存`)?.value).toBe(
      'Save',
    );
    await Promise.all([
      editRepositoryTranslations({
        config_file,
        locale: 'en-US',
        updates: [{ key: '保存', value: 'Save now' }],
      }),
      editRepositoryTranslations({
        config_file,
        locale: 'en-US',
        updates: [{ key: '取消', value: 'Cancel' }],
      }),
    ]);
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(root, 'i18n', 'locales', 'en-US.manual.json'),
          'utf8',
        ),
      ),
    ).toEqual({ 保存: 'Save now', 取消: 'Cancel' });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
