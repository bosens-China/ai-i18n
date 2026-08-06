import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import { closeProjectMemoryStores } from '../src/project-files';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(async () => {
  vi.unstubAllEnvs();
  await cleanupFixtures();
});

test('reads current sharded JSON without a storage marker', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  await expect(
    fs.access(path.join(directory, 'storage.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  expect(await fs.readdir(path.join(directory, 'translations'))).toEqual(
    expect.arrayContaining(['manifest.json']),
  );
  await expect(
    new AiI18nProjectService().listTranslations({
      i18n_directory: directory,
      limit: 50,
    }),
  ).resolves.toMatchObject({ message_count: 2 });
});

test('requests a full Build when the selected SQLite cache is missing', async () => {
  const dataRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-mcp-data-'),
  );
  vi.stubEnv('AI_I18N_DATA_DIR', dataRoot);
  try {
    const root = await fixture('sqlite');
    const directory = path.join(root, 'apps/web/i18n');
    await fs.rm(path.join(dataRoot, 'translation-memory.sqlite'));

    await expect(
      new AiI18nProjectService().listTranslations({
        i18n_directory: directory,
        limit: 50,
      }),
    ).rejects.toMatchObject({ code: 'MESSAGE_MISSING_FROM_TRANSLATIONS' });
    await expect(
      fs.access(path.join(dataRoot, 'translation-memory.sqlite')),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(directory, 'translation-memory.sqlite')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  } finally {
    await closeProjectMemoryStores();
    await fs.rm(dataRoot, { recursive: true, force: true });
  }
});
