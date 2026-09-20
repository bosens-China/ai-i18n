import fs from 'node:fs/promises';
import type { PathLike } from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { normalizePath, type InlineConfig, type Plugin } from 'vite';
import { aiI18n } from '../src/plugin';
import { scanProject } from '../src/scan';
import { fixtureRoot, options, write } from './review-server-test-utils';

afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const workspace = await fixtureRoot();
  const root = path.join(workspace, 'app');
  await write(workspace, 'pnpm-workspace.yaml', 'packages: [app, sibling]');
  await write(
    root,
    'index.html',
    '<script type="module" src="/main.ts"></script>',
  );
  await write(
    root,
    'main.ts',
    "import { t } from 'virtual:ai-i18n'; console.log(t('保存'));",
  );
  await write(
    root,
    'node_modules/test-runtime/index.js',
    'export const t = (value) => value;',
  );
  const config = (plugins: Plugin[] = []): InlineConfig => ({
    root,
    configFile: false,
    cacheDir: path.join(root, 'node_modules/.vite'),
    logLevel: 'silent',
    resolve: {
      alias: {
        '@ai-i18n/vite/runtime': path.join(
          root,
          'node_modules/test-runtime/index.js',
        ),
      },
    },
    plugins: [aiI18n(options), ...plugins],
  });
  return { workspace, root, config };
}

it('allows unrelated workspace edits and generated declarations without caching an unstable snapshot', async () => {
  const { workspace, root, config } = await fixture();
  await write(workspace, 'sibling/README.md', 'before');
  let count = 0;
  const input = config([
    {
      name: 'third-party-generator',
      async transform(_code, id) {
        if (id !== normalizePath(path.join(root, 'main.ts'))) return;
        count++;
        for (const file of [
          'sibling/README.md',
          'sibling/auto-imports.d.ts',
          'app/components.d.ts',
          '.agents/session.json',
          '.vscode/settings.json',
          '.cache/output.json',
        ])
          await write(workspace, file, String(count));
      },
    },
  ]);
  expect(await scanProject(input)).toMatchObject({
    message_count: 1,
    reused: false,
  });
  expect(count).toBeGreaterThan(0);
  await expect(
    fs.access(path.join(root, 'node_modules/.vite/ai-i18n-scan.json')),
  ).rejects.toThrow();
});

it.each(['realpath', 'stat'] as const)(
  'tolerates unrelated %s EACCES but rejects unreadable dependencies',
  async (method) => {
    const { workspace, root, config } = await fixture();
    const unrelated = path.join(workspace, 'CLAUDE.md');
    await write(workspace, 'CLAUDE.md', 'unrelated');
    const fail = (file: PathLike) => {
      if (String(file) === unrelated)
        throw Object.assign(new Error('denied'), { code: 'EACCES' });
    };
    const originalRealpath = fs.realpath;
    const originalStat = fs.stat;
    const spy =
      method === 'realpath'
        ? vi.spyOn(fs, 'realpath').mockImplementation(async (file) => {
            fail(file);
            return originalRealpath(file);
          })
        : vi.spyOn(fs, 'stat').mockImplementation(async (file) => {
            fail(file);
            return originalStat(file);
          });
    expect(await scanProject(config())).toMatchObject({
      message_count: 1,
      reused: false,
    });
    expect((await scanProject(config())).reused).toBe(false);
    spy.mockRestore();
    const realpath = fs.realpath;
    vi.spyOn(fs, 'realpath').mockImplementation(async (file) => {
      if (String(file) === path.join(root, 'main.ts'))
        throw Object.assign(new Error('dependency denied'), { code: 'EACCES' });
      return realpath(file);
    });
    await expect(scanProject(config())).rejects.toThrow('dependency denied');
  },
);

it('ignores a dangling workspace link without reusing an incomplete fingerprint', async () => {
  const { workspace, config } = await fixture();
  await fs.symlink(
    path.join(workspace, 'missing'),
    path.join(workspace, 'broken'),
    'junction',
  );
  expect(await scanProject(config())).toMatchObject({
    message_count: 1,
    reused: false,
  });
  expect((await scanProject(config())).reused).toBe(false);
});

it('invalidates cache for glob additions and deletions, and rejects additions during traversal', async () => {
  const { root, config } = await fixture();
  await write(
    root,
    'main.ts',
    "console.log(import.meta.glob('./pages/*.ts'));",
  );
  const page = "import { t } from 'virtual:ai-i18n'; console.log(t('页面'));";
  await write(root, 'pages/first.ts', page);
  expect((await scanProject(config())).message_count).toBe(1);
  expect((await scanProject(config())).reused).toBe(true);
  await write(root, 'pages/second.ts', page.replace('页面', '新增'));
  expect(await scanProject(config())).toMatchObject({
    message_count: 2,
    reused: false,
  });
  await fs.rm(path.join(root, 'pages/first.ts'));
  expect(await scanProject(config())).toMatchObject({
    message_count: 1,
    reused: false,
  });
  await expect(
    scanProject(
      config([
        {
          name: 'add-page',
          async transform(_code, id) {
            if (id === normalizePath(path.join(root, 'pages/second.ts')))
              await write(root, 'pages/third.ts', page);
          },
        },
      ]),
    ),
  ).rejects.toThrow('Source changed during scanning');
});

it.each(['main.ts', 'tsconfig.json'])(
  'rejects changes to %s during scanning and preserves the catalog',
  async (file) => {
    const { root, config } = await fixture();
    await write(root, 'tsconfig.json', '{}');
    await scanProject(config());
    const directory = path.join(root, 'i18n/extracted');
    const catalog = path.join(directory, (await fs.readdir(directory))[0]!);
    const previous = await fs.readFile(catalog, 'utf8');
    await expect(
      scanProject(
        config([
          {
            name: 'change-input',
            async transform(_code, id) {
              if (id === normalizePath(path.join(root, 'main.ts')))
                await write(
                  root,
                  file,
                  file === 'main.ts' ? 'export {};' : '{"compilerOptions":{}}',
                );
            },
          },
        ]),
      ),
    ).rejects.toThrow('Source changed during scanning');
    expect(await fs.readFile(catalog, 'utf8')).toBe(previous);
  },
);

it('passes the runner loader to Vite for workspace TypeScript configuration', async () => {
  const { workspace, root, config } = await fixture();
  await write(
    workspace,
    'shared/options.ts',
    "export const mode: string = 'runner-test';",
  );
  await write(
    root,
    'vite.config.ts',
    "import { mode } from '../shared/options'; export default { mode };",
  );
  expect(
    await scanProject({
      ...config(),
      configFile: path.join(root, 'vite.config.ts'),
      configLoader: 'runner',
    }),
  ).toMatchObject({ mode: 'runner-test', message_count: 1 });
});

it.each(['shared.ts', '.agents/shared.ts'])(
  'validates consumed %s outside the app even when candidate checks exclude it',
  async (file) => {
    const { workspace, root, config } = await fixture();
    await fs.rm(path.join(workspace, 'pnpm-workspace.yaml'));
    await write(root, 'main.ts', `import '../${file}';`);
    await write(
      workspace,
      file,
      "import { t } from 'virtual:ai-i18n'; console.log(t('共享'));",
    );
    await expect(
      scanProject(
        config([
          {
            name: 'change-shared',
            async transform(_code, id) {
              if (id === normalizePath(path.join(workspace, file)))
                await write(workspace, file, 'export {};');
            },
          },
        ]),
      ),
    ).rejects.toThrow('Source changed during scanning');
  },
);
