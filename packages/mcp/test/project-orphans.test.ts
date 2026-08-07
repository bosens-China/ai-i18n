import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import {
  addFixtureOrphanMessage,
  addFixtureSourceFile,
  cleanupFixtures,
  fixture,
  readFixtureMemory,
  readFixtureOverrides,
} from './project-fixture';

afterEach(cleanupFixtures);

test('lists only orphan messages with locale filtering and pagination', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureOrphanMessage(directory, {
    id: '旧文案',
    source: '旧文案',
    translations: { 'en-US': 'Legacy', 'ja-JP': null },
  });
  await addFixtureOrphanMessage(directory, {
    id: '旧文案#menu',
    source: '旧文案',
    comment: 'menu',
    translations: { 'en-US': 'Old label', 'ja-JP': '旧ラベル' },
  });
  const service = new AiI18nProjectService();

  const first = await service.listOrphanMessages({
    i18n_directory: directory,
    locales: ['en-US'],
    limit: 1,
  });
  expect(first).toMatchObject({
    total_count: 2,
    count: 1,
    has_more: true,
  });
  expect(first.items[0]).toMatchObject({
    orphan_id: expect.stringMatching(/^[a-f0-9]{64}$/),
    translations: { 'en-US': expect.any(String) },
  });
  expect(first.items[0]?.message.source).toBe('旧文案');

  const second = await service.listOrphanMessages({
    i18n_directory: directory,
    locales: ['en-US'],
    cursor: first.next_cursor,
    limit: 1,
  });
  expect(second).toMatchObject({ count: 1, has_more: false });
  expect([...first.items, ...second.items].map((item) => item.message)).toEqual(
    expect.arrayContaining([
      { source: '旧文案' },
      { source: '旧文案', comment: 'menu' },
    ]),
  );
  expect(
    [...first.items, ...second.items].some(
      (item) => item.message.source === '保存',
    ),
  ).toBe(false);
});

test('deletes selected orphan messages without changing human overrides', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureOrphanMessage(directory, {
    id: '旧文案',
    source: '旧文案',
    translations: { 'en-US': 'Legacy', 'ja-JP': null },
  });
  await fs.writeFile(
    path.join(directory, 'overrides.json'),
    JSON.stringify({
      version: 2,
      rules: [
        {
          source: '旧文案',
          translations: { 'en-US': 'Reviewed legacy' },
        },
      ],
    }),
  );
  const service = new AiI18nProjectService();
  const listed = await service.listOrphanMessages({
    i18n_directory: directory,
    limit: 50,
  });
  const orphanId = listed.items[0]!.orphan_id;

  await expect(
    service.deleteOrphanMessages({
      i18n_directory: directory,
      orphan_ids: [orphanId],
    }),
  ).resolves.toEqual({ deleted_count: 1, unchanged_count: 0 });
  expect((await readFixtureMemory(directory)).messages).not.toHaveProperty(
    '旧文案',
  );
  expect(await readFixtureOverrides(directory)).toMatchObject({
    rules: [
      {
        source: '旧文案',
        translations: { 'en-US': 'Reviewed legacy' },
      },
    ],
  });
  await expect(
    service.deleteOrphanMessages({
      i18n_directory: directory,
      orphan_ids: [orphanId],
    }),
  ).resolves.toEqual({ deleted_count: 0, unchanged_count: 1 });
});

test('fails the whole delete batch when one message became active', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureOrphanMessage(directory, {
    id: '旧文案A',
    source: '旧文案A',
  });
  await addFixtureOrphanMessage(directory, {
    id: '旧文案B',
    source: '旧文案B',
  });
  const service = new AiI18nProjectService();
  const listed = await service.listOrphanMessages({
    i18n_directory: directory,
    limit: 50,
  });
  await addFixtureSourceFile(directory, 'src/restored.ts', {
    id: '旧文案B',
    source: '旧文案B',
  });

  await expect(
    service.deleteOrphanMessages({
      i18n_directory: directory,
      orphan_ids: listed.items.map((item) => item.orphan_id),
    }),
  ).rejects.toMatchObject({ code: 'ORPHAN_MESSAGE_REACTIVATED' });
  expect(await readFixtureMemory(directory)).toMatchObject({
    messages: {
      旧文案A: expect.any(Object),
      旧文案B: expect.any(Object),
    },
  });
});

test('rejects malformed and duplicate orphan ids', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await addFixtureOrphanMessage(directory, {
    id: '旧文案',
    source: '旧文案',
  });
  const service = new AiI18nProjectService();
  await expect(
    service.deleteOrphanMessages({
      i18n_directory: directory,
      orphan_ids: ['invalid'],
    }),
  ).rejects.toMatchObject({ code: 'INVALID_ORPHAN_ID' });

  const listed = await service.listOrphanMessages({
    i18n_directory: directory,
    limit: 50,
  });
  const orphanId = listed.items[0]!.orphan_id;
  await expect(
    service.deleteOrphanMessages({
      i18n_directory: directory,
      orphan_ids: [orphanId, orphanId],
    }),
  ).rejects.toMatchObject({ code: 'DUPLICATE_TARGET' });
});
