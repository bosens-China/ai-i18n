import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
  deleteOrphanMessages,
  listOrphanMessages,
} from '../src/project-orphans';
import { setOverrides, setTranslations } from '../src/project-write';
import {
  addFixtureOrphanMessage,
  cleanupFixtures,
  fixture,
  readFixtureMemory,
  readFixtureOverrides,
} from './project-fixture';

afterEach(cleanupFixtures);

test('serializes concurrent translation and override updates', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  await Promise.all([
    setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '保存' },
          locale: 'en-US',
          value: 'Save',
        },
      ],
    }),
    setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '退出' },
          locale: 'ja-JP',
          value: '終了',
        },
      ],
    }),
    setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '保存' },
          locale: 'en-US',
          value: 'Keep',
        },
      ],
    }),
    setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '退出' },
          locale: 'ja-JP',
          value: 'Leave',
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
    version: 2,
    rules: expect.arrayContaining([
      { source: '保存', translations: { 'en-US': 'Keep' } },
      { source: '退出', translations: { 'ja-JP': 'Leave' } },
    ]),
  });
});

test('serializes orphan deletion with translation updates', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureOrphanMessage(directory, {
    id: '旧文案',
    source: '旧文案',
  });
  const listed = await listOrphanMessages({
    i18n_directory: directory,
    limit: 50,
  });

  await Promise.all([
    deleteOrphanMessages({
      i18n_directory: directory,
      orphan_ids: [listed.items[0]!.orphan_id],
    }),
    setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '保存' },
          locale: 'en-US',
          value: 'Save',
        },
      ],
    }),
  ]);

  expect(await readFixtureMemory(directory)).toMatchObject({
    messages: {
      保存: { translations: { 'en-US': 'Save' } },
    },
  });
  expect((await readFixtureMemory(directory)).messages).not.toHaveProperty(
    '旧文案',
  );
});
