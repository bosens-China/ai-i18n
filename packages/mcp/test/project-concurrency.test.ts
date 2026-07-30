import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import {
  cleanupFixtures,
  fixture,
  readFixtureMemory,
  readFixtureOverrides,
} from './project-fixture';

afterEach(cleanupFixtures);

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
          message: { source: '保存' },
          locale: 'en-US',
          value: 'Save',
        },
      ],
    }),
    second.setTranslations({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '退出' },
          locale: 'ja-JP',
          value: '終了',
        },
      ],
    }),
    first.setOverrides({
      i18n_directory: directory,
      updates: [
        {
          message: { source: '保存' },
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
          message: { source: '退出' },
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
