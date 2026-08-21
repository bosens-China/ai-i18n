import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import { addFixtureMessage, cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('lists global, file-scoped, commented, and orphaned human overrides', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addCommentedMessage(directory);
  await fs.writeFile(
    path.join(directory, 'overrides.json'),
    JSON.stringify({
      version: 2,
      rules: [
        { source: '保存', translations: { 'en-US': 'Keep' } },
        {
          source: '保存',
          comment: 'toolbar',
          files: ['src/home.ts'],
          translations: { 'ja-JP': '保つ' },
        },
        { source: '旧文案', translations: { 'en-US': 'Legacy' } },
      ],
    }),
  );

  const result = await new AiI18nProjectService().listOverrides({
    i18n_directory: directory,
    limit: 50,
  });
  expect(result).toMatchObject({
    total_count: 3,
    global_override_count: 2,
    file_override_count: 1,
  });
  expect(result.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: 'global',
        message: { source: '保存' },
        locale: 'en-US',
        value: 'Keep',
        orphaned: false,
        override_id: expect.any(String),
      }),
      expect.objectContaining({
        scope: 'files',
        message: { source: '保存', comment: 'toolbar' },
        files: ['src/home.ts'],
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

async function addCommentedMessage(directory: string): Promise<void> {
  await addFixtureMessage(directory, {
    id: '保存#toolbar',
    source: '保存',
    comment: 'toolbar',
  });
}
