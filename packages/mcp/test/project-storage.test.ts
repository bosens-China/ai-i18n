import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { listTranslations } from '../src/project-read';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(async () => {
  await cleanupFixtures();
});

test('reads current sharded JSON without a storage marker', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  await expect(
    fs.access(path.join(directory, 'storage.json')),
  ).rejects.toMatchObject({ code: 'ENOENT' });
  const entries = await fs.readdir(path.join(directory, 'translations'), {
    recursive: true,
  });
  expect(entries.filter((entry) => entry.endsWith('.json'))).toHaveLength(4);
  await expect(
    listTranslations({
      i18n_directory: directory,
      limit: 50,
    }),
  ).resolves.toMatchObject({ message_count: 2 });
});
