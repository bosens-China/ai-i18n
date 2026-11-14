import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { writeLocaleOutput } from '../src/locale-output.js';
import type { TranslationCatalog } from '../src/translation-adapter.js';

const catalog: TranslationCatalog = {
  sourceLang: 'zh-CN',
  locales: ['zh-CN', 'en-US'],
  messages: [
    { key: '保存', source: '保存', scope: 'global' },
    {
      key: 'f:a:保存',
      source: '保存',
      scope: 'file',
      file: { id: 'a', path: 'src/a.ts' },
    },
  ],
};

test('writes minimal grouped JSON and never reads a previous generated result as manual', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-output-'));
  try {
    await writeLocaleOutput(
      directory,
      catalog,
      { 'en-US': { 保存: 'Save', 'f:a:保存': 'Save here' } },
      { a: 'page' },
    );
    const global = path.join(directory, 'locales', 'en-US.json');
    const file = path.join(directory, 'locales', 'files', 'en-US', 'page.json');
    expect(JSON.parse(await fs.readFile(global, 'utf8'))).toEqual({
      保存: 'Save',
    });
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({
      'f:a:保存': 'Save here',
    });
    expect(
      JSON.parse(
        await fs.readFile(
          path.join(directory, 'locales', 'files', 'manifest.json'),
          'utf8',
        ),
      ),
    ).toEqual({ a: 'page' });
    await fs.writeFile(
      path.join(directory, 'locales', 'fr-FR.json'),
      '{"stale":"Old"}',
    );
    await fs.writeFile(
      path.join(directory, 'locales', 'fr-FR.manual.json'),
      '{"keep":"Value"}',
    );
    await fs.mkdir(path.join(directory, 'locales', 'files', 'fr-FR'));
    await fs.writeFile(
      path.join(directory, 'locales', 'files', 'fr-FR', 'old.json'),
      '{}',
    );
    await writeLocaleOutput(directory, catalog, {}, { a: 'page' });
    expect(JSON.parse(await fs.readFile(global, 'utf8'))).toEqual({});
    expect(JSON.parse(await fs.readFile(file, 'utf8'))).toEqual({});
    await expect(
      fs.access(path.join(directory, 'locales', 'fr-FR.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.access(path.join(directory, 'locales', 'files', 'fr-FR', 'old.json')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await fs.access(path.join(directory, 'locales', 'fr-FR.manual.json'));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
