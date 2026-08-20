import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import {
  addFixtureMessage,
  addFixtureSourceFile,
  cleanupFixtures,
  fixture,
  readFixtureMemory,
  readFixtureOverrides,
} from './project-fixture';

afterEach(cleanupFixtures);

test('validates message references, file scopes, templates, and duplicates', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: reference('不存在'),
          locale: 'en-US',
          value: 'Missing',
        },
      ],
    }),
  ).rejects.toMatchObject({
    code: 'MESSAGE_NOT_FOUND',
    details: { next_tool: 'ai_i18n_list_translations' },
  });
  await addFixtureSourceFile(directory, 'src/exit.ts', {
    id: '退出',
    source: '退出',
  });
  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          files: ['src/exit.ts'],
          locale: 'en-US',
          value: 'Save',
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND_IN_SOURCE_FILE' });
  await expect(
    service.clearTranslations({
      i18n_directory: directory,
      targets: [
        { message: reference('保存'), locale: 'en-US' },
        { message: reference('保存'), locale: 'en-US' },
      ],
    }),
  ).resolves.toMatchObject({
    unchanged_count: 1,
    deduplicated_count: 1,
    affected_file_count: 1,
  });

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        { message: reference('保存'), locale: 'en-US', value: 'Save' },
        { message: reference('保存'), locale: 'en-US', value: 'Store' },
      ],
    }),
  ).rejects.toMatchObject({ code: 'DUPLICATE_TARGET_CONFLICT' });

  await addFixtureMessage(directory, {
    id: '当前 {{0}} / {{1}} / {{1}}',
    source: '当前 {{0}} / {{1}} / {{1}}',
  });
  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: reference('当前 {{0}} / {{1}} / {{1}}'),
          locale: 'en-US',
          value: 'Current {{0}} / {{2}}',
        },
      ],
    }),
  ).rejects.toMatchObject({
    code: 'TEMPLATE_TOKEN_MISMATCH',
    details: {
      expected_tokens: ['{{0}}', '{{1}}', '{{1}}'],
      received_tokens: ['{{0}}', '{{2}}'],
      missing_tokens: ['{{1}}', '{{1}}'],
      unexpected_tokens: ['{{2}}'],
    },
  });
  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: reference('当前 {{0}} / {{1}} / {{1}}'),
          locale: 'en-US',
          value: 'Current {{0}}',
        },
      ],
    }),
  ).rejects.toMatchObject({
    code: 'TEMPLATE_TOKEN_MISMATCH',
    details: {
      missing_tokens: ['{{1}}', '{{1}}'],
      unexpected_tokens: [],
    },
  });
  expect(
    (await readFixtureMemory(directory)).messages['当前 {{0}} / {{1}} / {{1}}']
      ?.translations['en-US'],
  ).toBeNull();
  expect(await readFixtureOverrides(directory)).toEqual({
    version: 2,
    rules: [],
  });
});

test('groups identical file overrides and keeps file targets independent', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureSourceFile(directory, 'src/shared.ts', {
    id: '保存',
    source: '保存',
  });
  const service = new AiI18nProjectService();

  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          files: ['src/shared.ts', 'src/home.ts'],
          locale: 'en-US',
          value: 'Save file',
        },
      ],
    }),
  ).resolves.toEqual({
    added_count: 2,
    overwritten_count: 0,
    unchanged_count: 0,
    deduplicated_count: 0,
    affected_file_count: 2,
  });
  expect(await readFixtureOverrides(directory)).toEqual({
    version: 2,
    rules: [
      {
        source: '保存',
        files: ['src/home.ts', 'src/shared.ts'],
        translations: { 'en-US': 'Save file' },
      },
    ],
  });

  await service.setOverrides({
    i18n_directory: directory,
    updates: [
      {
        message: reference('保存'),
        files: ['src/home.ts'],
        locale: 'en-US',
        value: 'Home save',
      },
    ],
  });
  expect(await readFixtureOverrides(directory)).toEqual({
    version: 2,
    rules: expect.arrayContaining([
      {
        source: '保存',
        files: ['src/home.ts'],
        translations: { 'en-US': 'Home save' },
      },
      {
        source: '保存',
        files: ['src/shared.ts'],
        translations: { 'en-US': 'Save file' },
      },
    ]),
  });
});

test('distinguishes occurrence overrides on the same source line', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureSourceFile(directory, 'src/actions.ts', {
    id: '保存',
    source: '保存',
    locations: [
      { line: 3, column: 8 },
      { line: 3, column: 25 },
    ],
  });
  const service = new AiI18nProjectService();

  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          occurrences: [
            { source_file: 'src/actions.ts', line: 3, column: 8 },
            { source_file: 'src/actions.ts', line: 3, column: 25 },
          ],
          locale: 'en-US',
          value: 'Save here',
        },
      ],
    }),
  ).resolves.toMatchObject({ added_count: 2, affected_file_count: 1 });

  const listed = await service.listOverrides({
    i18n_directory: directory,
    limit: 50,
  });
  expect(listed).toMatchObject({
    occurrence_override_count: 1,
    items: [
      expect.objectContaining({
        scope: 'occurrences',
        occurrences: [
          { source_file: 'src/actions.ts', line: 3, column: 8 },
          { source_file: 'src/actions.ts', line: 3, column: 25 },
        ],
        orphaned: false,
      }),
    ],
  });

  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          occurrences: [{ source_file: 'src/actions.ts', line: 3, column: 9 }],
          locale: 'en-US',
          value: 'Wrong position',
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'MESSAGE_NOT_FOUND_AT_SOURCE_LOCATION' });
});

function reference(source: string, comment?: string) {
  return { source, ...(comment ? { comment } : {}) };
}
