import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, expect, test } from 'vitest';
import {
  sqlite,
  listSqliteCandidates,
  listSqliteProjects,
  cleanSqliteCache,
} from '../src/index';

const roots: string[] = [];
const target = { sourceLang: 'zh-CN', targetLang: 'en-US', source: '保存' };
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-candidates-'));
  roots.push(root);
  const dataDirectory = path.join(root, 'data');
  return { root, dataDirectory };
}

test('reviewed scopes survive separately, never auto-fill alone, and are withdrawn on deletion', async () => {
  const { root, dataDirectory } = await fixture();
  const cache = await sqlite({ dataDirectory }).open(root);
  try {
    await cache.sync([
      { ...target, value: 'Save', kind: 'reviewed', file: 'src/a.ts' },
      {
        ...target,
        value: 'Store',
        kind: 'reviewed',
        file: 'src/b.ts',
        location: { line: 2, column: 5 },
      },
    ]);
    expect(await cache.findUnique([target])).toEqual([undefined]);
    const page = await listSqliteCandidates(target, { dataDirectory });
    expect(page.candidates.map((item) => item.value)).toEqual([
      'Save',
      'Store',
    ]);
    expect(page.candidates[1]!.sources[0]).toMatchObject({
      file: 'src/b.ts',
      location: { line: 2, column: 5 },
      kind: 'reviewed',
    });
    await cache.sync([{ ...target, value: 'Save', kind: 'reviewed' }]);
    expect(await cache.findUnique([target])).toEqual([undefined]);
    await cache.sync([{ ...target, value: 'Save' }]);
    expect(await cache.findUnique([target])).toEqual(['Save']);
    expect((await cache.list(target)).candidates[0]!.sources).toHaveLength(1);
    await cache.sync([{ ...target, value: '' }]);
    expect(await cache.findUnique([target])).toEqual(['']);
    const db = new Database(
      path.join(dataDirectory, 'translation-memory.sqlite'),
    );
    expect(
      db.prepare('SELECT COUNT(*) AS count FROM candidates').get(),
    ).toEqual({ count: 1 });
    db.close();
  } finally {
    cache.close();
  }
});

test('manual conflicts block automatic reuse and pages never imply uniqueness', async () => {
  const { root, dataDirectory } = await fixture();
  const cache = await sqlite({ dataDirectory }).open(root);
  try {
    await cache.sync([
      { ...target, value: 'Save' },
      ...Array.from({ length: 12 }, (_, index) => ({
        ...target,
        value: `Variant ${index}`,
        kind: 'reviewed' as const,
        file: `src/${index}.ts`,
      })),
    ]);
    expect(await cache.findUnique([target])).toEqual([undefined]);
    const first = await cache.list(target);
    const second = await cache.list(target, { offset: 10 });
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect(
      new Set(
        [...first.candidates, ...second.candidates].map((item) => item.value),
      ).size,
    ).toBe(13);
    expect(second.automaticValue).toBeUndefined();
  } finally {
    cache.close();
  }
});

test('deduplicates values across projects and bounds source pages', async () => {
  const { root, dataDirectory } = await fixture();
  for (let index = 0; index < 12; index++) {
    const project = path.join(
      root,
      `project-${String(index).padStart(2, '0')}`,
    );
    await fs.mkdir(project);
    const cache = await sqlite({ dataDirectory }).open(project);
    try {
      await cache.sync([{ ...target, value: 'Save' }]);
    } finally {
      cache.close();
    }
  }
  const first = await listSqliteCandidates(target, { dataDirectory });
  expect(first.candidates).toHaveLength(1);
  expect(first.candidates[0]!.sources).toHaveLength(10);
  expect(first.candidates[0]!.sourcesHasMore).toBe(true);
  const second = await listSqliteCandidates(target, {
    dataDirectory,
    value: 'Save',
    sourceOffset: 10,
  });
  expect(second.candidates[0]!.sources).toHaveLength(2);
  expect(second.automaticValue).toBe('Save');
});

test('previews cleanup, rejects stale previews and cleans only the chosen project', async () => {
  const { root, dataDirectory } = await fixture();
  const other = path.join(root, 'other');
  await fs.mkdir(other);
  const first = await sqlite({ dataDirectory }).open(root);
  const second = await sqlite({ dataDirectory }).open(other);
  try {
    await first.sync([{ ...target, value: 'Save' }]);
    await second.sync([{ ...target, value: 'Store' }]);
    const project = await fs.realpath(root);
    const preview = await cleanSqliteCache({
      dataDirectory,
      project,
      scope: 'project',
    });
    expect(preview).toMatchObject({ records: 1, executed: false });
    await first.sync([{ ...target, value: 'Updated' }]);
    await expect(
      cleanSqliteCache({
        dataDirectory,
        project,
        scope: 'project',
        token: preview.token,
      }),
    ).rejects.toThrow('Cache changed');
    await first.sync([]);
    const orphan = await cleanSqliteCache({
      dataDirectory,
      project,
      scope: 'orphans',
    });
    expect(orphan.records).toBe(1);
    await cleanSqliteCache({
      dataDirectory,
      project,
      scope: 'orphans',
      token: orphan.token,
    });
    expect(
      (await listSqliteCandidates(target, { dataDirectory })).candidates.map(
        (item) => item.value,
      ),
    ).toEqual(['Store']);
    expect((await listSqliteProjects({ dataDirectory })).projects).toHaveLength(
      1,
    );
    const all = await cleanSqliteCache({ dataDirectory, scope: 'all' });
    await cleanSqliteCache({ dataDirectory, scope: 'all', token: all.token });
    expect((await listSqliteProjects({ dataDirectory })).projects).toEqual([]);
    // 清理后摘要失效，原项目相同快照也能重新贡献。
    await second.sync([{ ...target, value: 'Store' }]);
    expect(await second.findUnique([target])).toEqual(['Store']);
  } finally {
    first.close();
    second.close();
  }
});
