import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { paginate } from '../src/pagination';
import { filterTranslations } from '../src/project-files';
import { listTranslations } from '../src/project-read';
import { setTranslations } from '../src/project-write';
import {
  addFixtureMessage,
  addFixtureSourceFile,
  cleanupFixtures,
  fixture,
  readFixtureMemory,
} from './project-fixture';

afterEach(cleanupFixtures);

test('filters raw translations by multiple locales', () => {
  expect(
    filterTranslations({ 'en-US': null, 'ja-JP': '保存する' }, [
      'ja-JP',
      'fr-FR',
    ]),
  ).toEqual({
    'ja-JP': '保存する',
    'fr-FR': null,
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
  expect(() => paginate(items, (item) => item.id, 3, 'invalid')).toThrowError(
    expect.objectContaining({ code: 'INVALID_CURSOR' }),
  );
});

test('lists missing messages by default and file summaries on request', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  const missing = await listTranslations({
    i18n_directory: directory,
    limit: 1,
  });
  expect(missing).toMatchObject({
    view: 'missing',
    total_file_count: 1,
    completed_file_count: 0,
    pending_file_count: 1,
    extracted_message_count: 2,
    message_count: 2,
    missing_message_count: 2,
    missing_translation_count: 2,
    count: 1,
    has_more: true,
  });
  expect(missing.items[0]).toMatchObject({
    message: { source: '保存' },
    translations: { 'en-US': null, 'ja-JP': '保存する' },
    missing_locales: ['en-US'],
  });
  expect(missing.items[0]).not.toHaveProperty('source_files');
  expect(missing.items[0]).not.toHaveProperty('occurrences');

  const remaining = await listTranslations({
    i18n_directory: directory,
    limit: 1,
    cursor: missing.next_cursor,
  });
  expect(remaining.items[0]).toMatchObject({
    message: { source: '退出' },
    missing_locales: ['ja-JP'],
  });

  const summary = await listTranslations({
    i18n_directory: directory,
    view: 'summary',
    locales: ['en-US'],
    limit: 50,
  });
  expect(summary.items).toEqual([
    {
      source_file: 'src/home.ts',
      message_count: 2,
      missing_message_count: 1,
      missing_translation_count: 1,
      missing_by_locale: { 'en-US': 1 },
    },
  ]);

  await addFixtureSourceFile(directory, 'src/settings.ts', {
    id: '设置',
    source: '设置',
  });
  const oneFile = await listTranslations({
    i18n_directory: directory,
    source_files: ['src/settings.ts'],
    view: 'summary',
    limit: 50,
  });
  expect(oneFile).toMatchObject({
    total_file_count: 1,
    items: [{ source_file: 'src/settings.ts' }],
  });
  const multipleFiles = await listTranslations({
    i18n_directory: directory,
    source_files: ['src/settings.ts', 'src/home.ts'],
    view: 'summary',
    limit: 50,
  });
  expect(multipleFiles).toMatchObject({
    total_file_count: 2,
    items: [{ source_file: 'src/home.ts' }, { source_file: 'src/settings.ts' }],
  });

  await addFixtureSourceFile(directory, 'src/shared.ts', {
    id: '保存',
    source: '保存',
  });
  const shared = await listTranslations({
    i18n_directory: directory,
    include_source_files: true,
    limit: 100,
  });
  expect(
    shared.items.filter(
      (item) => 'message' in item && item.message.source === '保存',
    ),
  ).toEqual([
    expect.objectContaining({
      message: { source: '保存' },
      source_files: ['src/home.ts', 'src/shared.ts'],
    }),
  ]);
  const sharedFromOneFile = await listTranslations({
    i18n_directory: directory,
    source_files: ['src/shared.ts'],
    include_source_files: true,
    limit: 100,
  });
  expect(sharedFromOneFile.items).toEqual([
    expect.objectContaining({
      message: { source: '保存' },
      source_files: ['src/home.ts', 'src/shared.ts'],
    }),
  ]);

  const withOccurrences = await listTranslations({
    i18n_directory: directory,
    include_occurrences: true,
    limit: 100,
  });
  expect(
    withOccurrences.items.filter(
      (item) => 'message' in item && item.message.source === '保存',
    ),
  ).toEqual([
    expect.objectContaining({
      message: { source: '保存' },
      occurrences: [
        {
          source_file: 'src/home.ts',
          locations: [{ line: 1, column: 0 }],
        },
        {
          source_file: 'src/shared.ts',
          locations: [{ line: 1, column: 0 }],
        },
      ],
    }),
  ]);
  expect(withOccurrences.items[0]).not.toHaveProperty('source_files');
});

test('filters message views by source and selected translation values', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addCommentedMessage(directory);

  const first = await listTranslations({
    i18n_directory: directory,
    view: 'all',
    source_contains: '保存',
    limit: 1,
  });
  expect(first).toMatchObject({ message_count: 3, count: 1, has_more: true });
  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'all',
      source_contains: '保存',
      cursor: first.next_cursor,
      limit: 1,
    }),
  ).resolves.toMatchObject({ count: 1, has_more: false });

  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'all',
      locales: ['en-US'],
      translation_contains: 'EXIT',
      limit: 50,
    }),
  ).resolves.toMatchObject({
    total_count: 1,
    items: [expect.objectContaining({ message: { source: '退出' } })],
  });
  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'all',
      locales: ['ja-JP'],
      translation_contains: 'exit',
      limit: 50,
    }),
  ).resolves.toMatchObject({ total_count: 0, items: [] });
  await expect(
    listTranslations({
      i18n_directory: directory,
      view: 'summary',
      source_contains: '保存',
      limit: 50,
    }),
  ).rejects.toMatchObject({ code: 'INVALID_TRANSLATION_FILTER' });
});

test('keeps escaped internal message ids out of the public contract', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureMessage(directory, {
    id: '\\#pack',
    source: '#pack',
  });
  const listed = await listTranslations({
    i18n_directory: directory,
    limit: 100,
  });
  const item = listed.items.find(
    (candidate) =>
      'message' in candidate && candidate.message.source === '#pack',
  );
  expect(item).toMatchObject({ message: { source: '#pack' } });
  expect(item).not.toHaveProperty('message_id');

  await expect(
    setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '#pack' },
          locale: 'en-US',
          value: 'Pack',
        },
      ],
    }),
  ).resolves.toMatchObject({ added_count: 1 });
  expect(
    (await readFixtureMemory(directory)).messages['\\#pack']?.translations[
      'en-US'
    ],
  ).toBe('Pack');
});

async function addCommentedMessage(directory: string): Promise<void> {
  await addFixtureMessage(directory, {
    id: '保存#toolbar',
    source: '保存',
    comment: 'toolbar',
  });
}
