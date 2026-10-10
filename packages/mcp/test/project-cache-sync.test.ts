import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { listSqliteCandidates } from '@ai-i18n/sqlite';
import {
  setTranslations,
  setOverrides,
  clearTranslations,
} from '../src/project-write';
import { fixture, cleanupFixtures } from './project-fixture';

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupFixtures();
});

test('independent MCP writes sync configured automatic and reviewed values without running Provider', async () => {
  const root = await fixture();
  const app = path.join(root, 'apps/web');
  const directory = path.join(app, 'i18n');
  const dataDirectory = path.join(root, 'personal');
  const modules = path.join(app, 'node_modules/@ai-i18n');
  await fs.mkdir(modules, { recursive: true });
  for (const name of ['vite', 'sqlite'])
    await fs.symlink(
      path.resolve('packages', name),
      path.join(modules, name),
      'dir',
    );
  await fs.writeFile(
    path.join(app, 'vite.config.mjs'),
    `
    import {aiI18n} from '@ai-i18n/vite';
    import {sqlite} from '@ai-i18n/sqlite';
    export default {plugins: [aiI18n({sourceLang: 'zh-CN', dts: false,
      locales: [{value: 'zh-CN', label: '中文'}, {value: 'en-US', label: 'English'}],
      translationMemory: {cache: sqlite({dataDirectory: ${JSON.stringify(dataDirectory)}})},
      provider: {translator: () => {throw new Error('Provider must not run');}}
    })]};
  `,
  );
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  const input = {
    i18n_directory: directory,
    app_directory: app,
    default_locale: 'en-US',
  };
  await setTranslations({
    ...input,
    updates: [{ message: { source: '保存' }, value: 'Save' }],
  });
  const target = { sourceLang: 'zh-CN', targetLang: 'en-US', source: '保存' };
  expect(
    (await listSqliteCandidates(target, { dataDirectory })).automaticValue,
  ).toBe('Save');
  await setOverrides({
    ...input,
    updates: [{ message: { source: '保存' }, value: 'Store' }],
  });
  const page = await listSqliteCandidates(target, { dataDirectory });
  expect(page.candidates.map((item) => item.value)).toEqual(['Save', 'Store']);
  expect(page.automaticValue).toBeUndefined();
  await clearTranslations({
    ...input,
    targets: [{ message: { source: '保存' } }],
  });
  expect(
    (await listSqliteCandidates(target, { dataDirectory })).candidates.map(
      (item) => item.value,
    ),
  ).toEqual(['Store']);
  expect(stderr).not.toHaveBeenCalled();
});

test('cache config failures preserve committed project writes and report a warning', async () => {
  const root = await fixture();
  const app = path.join(root, 'apps/web');
  await fs.writeFile(
    path.join(app, 'vite.config.mjs'),
    "throw new Error('broken config');",
  );
  const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  await expect(
    setTranslations({
      i18n_directory: path.join(app, 'i18n'),
      app_directory: app,
      default_locale: 'en-US',
      updates: [{ message: { source: '保存' }, value: 'Saved' }],
    }),
  ).resolves.toMatchObject({ added_count: 1 });
  expect(stderr).toHaveBeenCalledWith(
    expect.stringContaining('Project write succeeded'),
  );
});
