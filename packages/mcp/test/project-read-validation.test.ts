import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('rejects invalid project paths, filters, and protocol files with codes', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.listTranslations({
      i18n_directory: 'apps/web/i18n',
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'I18N_DIRECTORY_NOT_ABSOLUTE' });
  await expect(
    service.listTranslations({
      i18n_directory: directory,
      source_files: ['src/missing.ts'],
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'SOURCE_FILE_NOT_FOUND' });
  await expect(
    service.listTranslations({
      i18n_directory: directory,
      locales: ['fr-FR'],
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'UNKNOWN_LOCALE' });

  await fs.rm(path.join(directory, 'overrides.json'));
  await expect(
    service.listTranslations({
      i18n_directory: directory,
      limit: 50,
    }),
  ).rejects.toMatchObject({
    code: 'REQUIRED_PROTOCOL_FILE_MISSING',
    details: {
      file: 'overrides.json',
    },
  });
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
    new AiI18nProjectService().listTranslations({
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
    new AiI18nProjectService().listTranslations({
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
    new AiI18nProjectService().listTranslations({
      i18n_directory: directory,
      view: 'summary',
      limit: 50,
    }),
  ).resolves.toMatchObject({
    items: [{ source_file: 'src/home.ts' }],
  });
});
