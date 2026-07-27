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

test('fills null translations atomically and requires explicit overwrite', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Save',
        },
        {
          source_file: 'src/home.ts',
          message_id: '退出',
          locale: 'en-US',
          value: 'Leave',
        },
      ],
    }),
  ).rejects.toMatchObject({
    code: 'TRANSLATION_CONFLICT',
    details: { conflict_count: 1, retry: { overwrite_existing: true } },
  });
  expect(
    (await readFixtureMemory(directory)).messages['保存']?.translations[
      'en-US'
    ],
  ).toBeNull();

  await addFixtureSourceFile(directory, 'src/settings.ts', {
    id: '设置',
    source: '设置',
  });
  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Save',
        },
        {
          source_file: 'src/home.ts',
          message_id: '退出',
          locale: 'ja-JP',
          value: '',
        },
        {
          source_file: 'src/settings.ts',
          message_id: '设置',
          locale: 'en-US',
          value: 'Settings',
        },
      ],
    }),
  ).resolves.toEqual({
    added_count: 3,
    overwritten_count: 0,
    unchanged_count: 0,
    affected_file_count: 2,
  });

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      overwrite_existing: true,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Store',
        },
      ],
    }),
  ).resolves.toMatchObject({
    added_count: 0,
    overwritten_count: 1,
  });
  expect(
    (await readFixtureMemory(directory)).messages['保存']?.translations[
      'en-US'
    ],
  ).toBe('Store');
});

test('clears translation values back to null without deleting fields', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.clearTranslations({
      i18n_directory: directory,
      targets: [
        {
          source_file: 'src/home.ts',
          message_id: '退出',
          locale: 'en-US',
        },
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
        },
      ],
    }),
  ).resolves.toEqual({
    cleared_count: 1,
    unchanged_count: 1,
    affected_file_count: 1,
  });
  const memory = await readFixtureMemory(directory);
  expect(memory.messages['退出']?.translations).toHaveProperty('en-US', null);
  expect(memory.messages['保存']?.translations).toHaveProperty('en-US', null);
});

test('sets and overwrites human reviews without changing translation memory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureMessage(directory, {
    id: '保存#toolbar',
    source: '保存',
    comment: 'toolbar',
  });
  const service = new AiI18nProjectService();

  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Keep',
          scope: 'default',
        },
        {
          source_file: 'src/home.ts',
          message_id: '保存#toolbar',
          locale: 'ja-JP',
          value: '保管',
          scope: 'message',
        },
      ],
    }),
  ).resolves.toEqual({
    added_count: 2,
    overwritten_count: 0,
    unchanged_count: 0,
    affected_file_count: 1,
  });

  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Retain',
          scope: 'default',
        },
      ],
    }),
  ).resolves.toMatchObject({
    added_count: 0,
    overwritten_count: 1,
  });

  expect(
    (await readFixtureMemory(directory)).messages['保存']?.translations[
      'en-US'
    ],
  ).toBeNull();
  expect(await readFixtureOverrides(directory)).toMatchObject({
    messages: {
      保存: {
        default: { 'en-US': 'Retain' },
        byId: { '保存#toolbar': { 'ja-JP': '保管' } },
      },
    },
  });
});

test('deletes exact listed override values and cleans empty containers', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();
  await service.setOverrides({
    i18n_directory: directory,
    updates: [
      {
        source_file: 'src/home.ts',
        message_id: '保存',
        locale: 'en-US',
        value: 'Keep',
        scope: 'default',
      },
    ],
  });
  const listed = await service.listOverrides({
    i18n_directory: directory,
    limit: 50,
  });
  const overrideId = listed.items[0]!.override_id;

  await expect(
    service.deleteOverrides({
      i18n_directory: directory,
      override_ids: [overrideId],
    }),
  ).resolves.toEqual({ deleted_count: 1, unchanged_count: 0 });
  expect(await readFixtureOverrides(directory)).toEqual({
    version: 1,
    messages: {},
  });
  await expect(
    service.deleteOverrides({
      i18n_directory: directory,
      override_ids: [overrideId],
    }),
  ).resolves.toEqual({ deleted_count: 0, unchanged_count: 1 });
});

test('validates message ids, message scope, templates, and duplicates', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '不存在',
          locale: 'en-US',
          value: 'Missing',
        },
      ],
    }),
  ).rejects.toMatchObject({
    code: 'MESSAGE_NOT_FOUND',
    details: { next_tool: 'ai_i18n_list_translations' },
  });
  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Save',
          scope: 'message',
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'MESSAGE_SCOPE_REQUIRES_COMMENT' });
  await expect(
    service.clearTranslations({
      i18n_directory: directory,
      targets: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
        },
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'DUPLICATE_TARGET' });

  await addFixtureMessage(directory, {
    id: '当前 {{0}}',
    source: '当前 {{0}}',
  });
  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '当前 {{0}}',
          locale: 'en-US',
          value: 'Current value',
        },
      ],
    }),
  ).rejects.toMatchObject({ code: 'TEMPLATE_TOKEN_MISMATCH' });
  expect(
    (await readFixtureMemory(directory)).messages['当前 {{0}}']?.translations[
      'en-US'
    ],
  ).toBeNull();
});

test('serializes concurrent translation and override updates', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const first = new AiI18nProjectService();
  const second = new AiI18nProjectService();

  await Promise.all([
    first.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Save',
        },
      ],
    }),
    second.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '退出',
          locale: 'ja-JP',
          value: '終了',
        },
      ],
    }),
    first.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '保存',
          locale: 'en-US',
          value: 'Keep',
          scope: 'default',
        },
      ],
    }),
    second.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          source_file: 'src/home.ts',
          message_id: '退出',
          locale: 'ja-JP',
          value: 'Leave',
          scope: 'default',
        },
      ],
    }),
  ]);

  expect(await readFixtureMemory(directory)).toMatchObject({
    messages: {
      保存: { translations: { 'en-US': 'Save' } },
      退出: { translations: { 'ja-JP': '終了' } },
    },
  });
  expect(await readFixtureOverrides(directory)).toMatchObject({
    messages: {
      保存: { default: { 'en-US': 'Keep' } },
      退出: { default: { 'ja-JP': 'Leave' } },
    },
  });
});
