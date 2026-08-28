import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { listTranslations } from '../src/project-read';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('rejects invalid project paths and filters with codes', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  await expect(
    listTranslations({
      i18n_directory: 'apps/web/i18n',
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'I18N_DIRECTORY_NOT_ABSOLUTE' });
  await expect(
    listTranslations({
      i18n_directory: directory,
      source_files: ['src/missing.ts'],
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_FILE_NOT_FOUND' });
  await expect(
    listTranslations({
      i18n_directory: directory,
      locales: ['fr-FR'],
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'UNKNOWN_LOCALE' });
});

test('rejects one message id assigned to different source text', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: '保存',
    source: '提交',
    locations: [{ line: 3, column: 0 }],
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));

  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'all',
      limit: 100,
    }),
  ).rejects.toMatchObject({ code: 'MESSAGE_ID_SOURCE_CONFLICT' });
});

test('reports every physical file for a duplicated extracted source', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const original = path.join(directory, 'extracted/src_home.ts.json');
  const duplicate = path.join(directory, 'extracted/duplicate.json');
  await fs.copyFile(original, duplicate);

  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'all',
      limit: 100,
    }),
  ).rejects.toMatchObject({
    code: 'DUPLICATE_EXTRACTED_SOURCE',
    details: {
      source_file: 'src/home.ts',
      conflicting_files: [
        'extracted/duplicate.json',
        'extracted/src_home.ts.json',
      ],
    },
  });
});

test('ignores nested directories outside the extracted protocol', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const nested = path.join(directory, 'extracted/legacy');
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, 'obsolete.json'), 'invalid');

  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'summary',
      limit: 50,
    }),
  ).resolves.toMatchObject({
    items: [{ source_file: 'src/home.ts' }],
  });
});
