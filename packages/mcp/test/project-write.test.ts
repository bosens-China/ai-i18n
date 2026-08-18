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
          message: reference('保存'),
          locale: 'en-US',
          value: 'Save',
        },
        {
          message: reference('退出'),
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
  await addFixtureSourceFile(directory, 'src/shared.ts', {
    id: '保存',
    source: '保存',
  });
  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          locale: 'en-US',
          value: 'Save',
        },
        {
          message: reference('退出'),
          locale: 'ja-JP',
          value: '',
        },
        {
          message: reference('设置'),
          locale: 'en-US',
          value: 'Settings',
        },
      ],
    }),
  ).resolves.toEqual({
    added_count: 3,
    overwritten_count: 0,
    unchanged_count: 0,
    deduplicated_count: 0,
    affected_file_count: 3,
  });

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          locale: 'en-US',
          value: 'Save',
        },
        {
          message: reference('保存'),
          locale: 'en-US',
          value: 'Save',
        },
      ],
    }),
  ).resolves.toEqual({
    added_count: 0,
    overwritten_count: 0,
    unchanged_count: 1,
    deduplicated_count: 1,
    affected_file_count: 2,
  });

  await expect(
    service.setTranslations({
      i18n_directory: directory,
      overwrite_existing: true,
      updates: [
        {
          message: reference('保存'),
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
          message: reference('退出'),
          locale: 'en-US',
        },
        {
          message: reference('保存'),
          locale: 'en-US',
        },
      ],
    }),
  ).resolves.toEqual({
    cleared_count: 1,
    unchanged_count: 1,
    deduplicated_count: 0,
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
          message: reference('保存'),
          locale: 'en-US',
          value: 'Keep',
        },
        {
          message: reference('保存', 'toolbar'),
          locale: 'ja-JP',
          value: '保管',
        },
      ],
    }),
  ).resolves.toEqual({
    added_count: 2,
    overwritten_count: 0,
    unchanged_count: 0,
    deduplicated_count: 0,
    affected_file_count: 1,
  });

  await expect(
    service.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: reference('保存'),
          locale: 'en-US',
          value: 'Retain',
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
    version: 2,
    rules: expect.arrayContaining([
      {
        source: '保存',
        translations: { 'en-US': 'Retain' },
      },
      {
        source: '保存',
        comment: 'toolbar',
        translations: { 'ja-JP': '保管' },
      },
    ]),
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
        message: reference('保存'),
        locale: 'en-US',
        value: 'Keep',
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
    version: 2,
    rules: [],
  });
  await expect(
    service.deleteOverrides({
      i18n_directory: directory,
      override_ids: [overrideId],
    }),
  ).resolves.toEqual({ deleted_count: 0, unchanged_count: 1 });
});

function reference(source: string, comment?: string) {
  return { source, ...(comment ? { comment } : {}) };
}
