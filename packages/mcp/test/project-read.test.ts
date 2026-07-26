import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { paginate } from '../src/pagination';
import { AiI18nProjectService } from '../src/project';
import { filterTranslations } from '../src/project-files';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('treats a missing scoped locale as an untranslated value', () => {
  expect(filterTranslations({ 'en-US': null }, 'ja-JP')).toEqual({
    'ja-JP': null,
  });
});

test('enforces response size and rejects invalid cursors', () => {
  const items = [{ id: '示例' }, { id: '请输入' }, { id: '首页' }];
  const first = paginate(items, (item) => item.id, 3, undefined, 1);

  expect(first).toMatchObject({
    items: [{ id: '示例' }],
    has_more: true,
    truncated_by_size: true,
  });
  expect(
    paginate(items, (item) => item.id, 3, first.next_cursor).items,
  ).toEqual([{ id: '请输入' }, { id: '首页' }]);
  expect(() => paginate(items, (item) => item.id, 3, 'invalid')).toThrow(
    'invalid cursor',
  );
});

test('lists missing files and effective translations with cursor pagination', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  const files = await service.listFiles({
    i18n_directory: directory,
    limit: 50,
  });
  expect(files.items).toEqual([
    {
      file: 'src/home.ts',
      message_count: 2,
      missing_count: 2,
      missing_by_locale: { 'en-US': 1, 'ja-JP': 1 },
    },
  ]);

  const first = await service.listTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    missing_only: true,
    limit: 1,
  });
  expect(first.items[0]).toMatchObject({
    message_id: '保存',
    translations: { 'en-US': null, 'ja-JP': '保存する' },
    missing_locales: ['en-US'],
  });
  expect(first.has_more).toBe(true);

  const second = await service.listTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    missing_only: true,
    limit: 1,
    cursor: first.next_cursor,
  });
  expect(second.items[0]?.message_id).toBe('退出');
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
      missing_only: false,
      limit: 100,
    }),
  ).rejects.toThrow('message ID "保存" refers to both "保存" and "提交"');
});

test('requires an absolute directory and rejects unknown source files', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.listFiles({ i18n_directory: 'apps/web/i18n', limit: 50 }),
  ).rejects.toThrow('must be an absolute path');
  await expect(
    service.listFiles({
      i18n_directory: path.join(root, 'missing-i18n'),
      limit: 50,
    }),
  ).rejects.toThrow('pass its final absolute path');
  await expect(
    service.listTranslations({
      i18n_directory: directory,
      file: 'src/missing.ts',
      missing_only: true,
      limit: 100,
    }),
  ).rejects.toThrow('extracted source not found');
});

test('requires both translation input files', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await fs.rm(path.join(directory, 'overrides.json'));

  await expect(
    new AiI18nProjectService().listFiles({
      i18n_directory: directory,
      limit: 50,
    }),
  ).rejects.toThrow('required ai-i18n file is missing: overrides.json');
});

test('requires the extracted protocol directory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await fs.rm(path.join(directory, 'extracted'), { recursive: true });

  await expect(
    new AiI18nProjectService().listFiles({
      i18n_directory: directory,
      limit: 50,
    }),
  ).rejects.toThrow('required ai-i18n directory is missing: extracted');
});

test('ignores nested extracted directories outside the current protocol', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const nested = path.join(directory, 'extracted/legacy');
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, 'obsolete.json'), 'invalid');

  await expect(
    new AiI18nProjectService().listFiles({
      i18n_directory: directory,
      limit: 50,
    }),
  ).resolves.toMatchObject({
    items: [{ file: 'src/home.ts' }],
  });
});
