import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { paginate } from '../src/pagination';
import { AiI18nProjectService } from '../src/project';
import { filterTranslations } from '../src/project-files';
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
  const service = new AiI18nProjectService();

  const missing = await service.listTranslations({
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

  const remaining = await service.listTranslations({
    i18n_directory: directory,
    limit: 1,
    cursor: missing.next_cursor,
  });
  expect(remaining.items[0]).toMatchObject({
    message: { source: '退出' },
    missing_locales: ['ja-JP'],
  });

  const summary = await service.listTranslations({
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
  const oneFile = await service.listTranslations({
    i18n_directory: directory,
    source_files: ['src/settings.ts'],
    view: 'summary',
    limit: 50,
  });
  expect(oneFile).toMatchObject({
    total_file_count: 1,
    items: [{ source_file: 'src/settings.ts' }],
  });
  const multipleFiles = await service.listTranslations({
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
  const shared = await service.listTranslations({
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
  const sharedFromOneFile = await service.listTranslations({
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

  const withOccurrences = await service.listTranslations({
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

test('lists default, message-scoped, and orphaned human overrides', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addCommentedMessage(directory);
  await fs.writeFile(
    path.join(directory, 'overrides.json'),
    JSON.stringify({
      version: 1,
      messages: {
        保存: {
          default: { 'en-US': 'Keep' },
          byId: { '保存#toolbar': { 'ja-JP': '保つ' } },
        },
        旧文案: { default: { 'en-US': 'Legacy' } },
      },
    }),
  );

  const result = await new AiI18nProjectService().listOverrides({
    i18n_directory: directory,
    limit: 50,
  });
  expect(result).toMatchObject({
    total_count: 3,
    default_override_count: 2,
    message_override_count: 1,
  });
  expect(result.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: 'default',
        message: { source: '保存' },
        locale: 'en-US',
        value: 'Keep',
        orphaned: false,
        override_id: expect.any(String),
      }),
      expect.objectContaining({
        scope: 'message',
        message: { source: '保存', comment: 'toolbar' },
        locale: 'ja-JP',
        orphaned: false,
      }),
      expect.objectContaining({
        message: { source: '旧文案' },
        value: 'Legacy',
        orphaned: true,
      }),
    ]),
  );
  expect(result.items.every((item) => !('source_files' in item))).toBe(true);

  const withSourceFiles = await new AiI18nProjectService().listOverrides({
    i18n_directory: directory,
    include_source_files: true,
    limit: 50,
  });
  expect(withSourceFiles.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        message: { source: '保存' },
        source_files: ['src/home.ts'],
      }),
      expect.objectContaining({
        message: { source: '旧文案' },
        source_files: [],
      }),
    ]),
  );
});

test('keeps escaped internal message ids out of the public contract', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureMessage(directory, {
    id: '\\#pack',
    source: '#pack',
  });
  const service = new AiI18nProjectService();
  const listed = await service.listTranslations({
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
    service.setTranslations({
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

async function addCommentedMessage(directory: string): Promise<void> {
  await addFixtureMessage(directory, {
    id: '保存#toolbar',
    source: '保存',
    comment: 'toolbar',
  });
}
