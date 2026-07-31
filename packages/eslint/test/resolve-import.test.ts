import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeStaticArgs } from '../src/analyze';
import { createImportResolver } from '../src/resolve-import';

const temporaryRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-resolver-'));
  temporaryRoots.push(root);
  const importer = path.join(root, 'entry.ts');
  fs.writeFileSync(importer, '');
  return { importer, root };
}

describe('ESLint import resolver cache', () => {
  it.each(['cjs', 'cts'])(
    'does not resolve unsupported CommonJS .%s source',
    (extension) => {
      const { importer, root } = createFixture();
      fs.writeFileSync(path.join(root, `legacy.${extension}`), '');
      const resolver = createImportResolver();

      expect(resolver('./legacy', importer)).toBeNull();
      expect(resolver(`./legacy.${extension}`, importer)).toBeNull();
    },
  );

  it('reuses positive and negative source probes', () => {
    const { importer, root } = createFixture();
    const target = path.join(root, 'target.ts');
    fs.writeFileSync(target, 'export const value = 1');
    const stat = vi.spyOn(fs, 'statSync');

    const firstResolver = createImportResolver();
    expect(firstResolver('./target', importer)).toBe(target);
    const positiveFirst = stat.mock.calls.length;
    expect(createImportResolver()('./target', importer)).toBe(target);
    const positiveSecond = stat.mock.calls.length - positiveFirst;

    const negativeStart = stat.mock.calls.length;
    expect(firstResolver('./missing', importer)).toBeNull();
    const negativeFirst = stat.mock.calls.length - negativeStart;
    expect(createImportResolver()('./missing', importer)).toBeNull();
    const negativeSecond =
      stat.mock.calls.length - negativeStart - negativeFirst;

    expect(positiveFirst).toBeGreaterThan(positiveSecond);
    expect(negativeFirst).toBeGreaterThan(negativeSecond);
  });

  it('invalidates a negative probe after the source directory changes', () => {
    const { importer, root } = createFixture();
    let now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    expect(createImportResolver()('./created-later', importer)).toBeNull();
    const target = path.join(root, 'created-later.ts');
    fs.writeFileSync(target, 'export const value = 1');
    now += 1_000;

    expect(createImportResolver()('./created-later', importer)).toBe(target);
  });

  it('refreshes tsconfig paths after the file changes', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    const nextSourceRoot = path.join(root, 'next-source');
    fs.mkdirSync(sourceRoot);
    fs.mkdirSync(nextSourceRoot);
    fs.writeFileSync(
      path.join(sourceRoot, 'value.ts'),
      'export const value = 1',
    );
    fs.writeFileSync(
      path.join(nextSourceRoot, 'value.ts'),
      'export const value = 2',
    );
    const tsconfigPath = path.join(root, 'tsconfig.json');
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['src/*'] } },
      }),
    );
    const resolver = createImportResolver(tsconfigPath);
    expect(resolver('@/value', importer)).toBe(
      path.join(sourceRoot, 'value.ts'),
    );
    expect(resolver('@/value', importer)).toBe(
      path.join(sourceRoot, 'value.ts'),
    );

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['next-source/*'] } },
      }),
    );
    expect(resolver('@/value', importer)).toBe(
      path.join(nextSourceRoot, 'value.ts'),
    );
  });

  it('skips resolver work for files without an i18n candidate', () => {
    const { importer, root } = createFixture();
    const tsconfigPath = path.join(root, 'tsconfig.json');
    fs.writeFileSync(tsconfigPath, '{}');
    const stat = vi.spyOn(fs, 'statSync');

    expect(
      analyzeStaticArgs(
        "import { answer } from './answer'; console.log(answer)",
        importer,
        tsconfigPath,
      ),
    ).toEqual([]);
    expect(stat).not.toHaveBeenCalled();
  });

  it('discovers the nearest tsconfig automatically', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    fs.mkdirSync(sourceRoot);
    const target = path.join(sourceRoot, 'messages.ts');
    fs.writeFileSync(target, "export const message = '保存'");
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['**/*.ts'],
      }),
    );

    expect(createImportResolver()('@/messages', importer)).toBe(target);
  });

  it('keeps the TypeScript 5.x and 6.x baseUrl lookup behavior', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    const mappedRoot = path.join(sourceRoot, 'mapped');
    fs.mkdirSync(mappedRoot, { recursive: true });
    const mapped = path.join(mappedRoot, 'messages.ts');
    const bare = path.join(sourceRoot, 'local-module.ts');
    fs.writeFileSync(mapped, "export const message = '映射'");
    fs.writeFileSync(bare, "export const message = 'baseUrl'");
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: './src',
          paths: { '@/*': ['mapped/*'] },
        },
        include: ['**/*.ts'],
      }),
    );

    const resolver = createImportResolver();
    expect(resolver('@/messages', importer)).toBe(mapped);
    expect(resolver('local-module', importer)).toBe(bare);
  });

  it('selects a referenced project from the importer include', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    const configRoot = path.join(root, 'config');
    fs.mkdirSync(sourceRoot);
    fs.mkdirSync(configRoot);
    const appTarget = path.join(sourceRoot, 'messages.ts');
    const nodeTarget = path.join(configRoot, 'messages.ts');
    fs.writeFileSync(appTarget, "export const message = '应用'");
    fs.writeFileSync(nodeTarget, "export const message = '配置'");
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        files: [],
        references: [
          { path: './tsconfig.app.json' },
          { path: './tsconfig.node.json' },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.app.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['src/**/*.ts', 'entry.ts'],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.node.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./config/*'] } },
        include: ['vite.config.ts'],
      }),
    );

    expect(createImportResolver()('@/messages', importer)).toBe(appTarget);
  });

  it('follows nested project references', () => {
    const { importer, root } = createFixture();
    const configs = path.join(root, 'configs');
    const sourceRoot = path.join(root, 'src');
    fs.mkdirSync(configs);
    fs.mkdirSync(sourceRoot);
    const target = path.join(sourceRoot, 'messages.ts');
    fs.writeFileSync(target, "export const message = '递归引用'");
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        files: [],
        references: [{ path: './configs' }],
      }),
    );
    fs.writeFileSync(
      path.join(configs, 'tsconfig.json'),
      JSON.stringify({
        files: [],
        references: [{ path: '../tsconfig.app.json' }],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.app.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['entry.ts', 'src/**/*.ts'],
      }),
    );

    expect(createImportResolver()('@/messages', importer)).toBe(target);
  });

  it('uses inherited paths from extends', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    fs.mkdirSync(sourceRoot);
    const target = path.join(sourceRoot, 'messages.ts');
    fs.writeFileSync(target, "export const message = '继承配置'");
    fs.writeFileSync(
      path.join(root, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        extends: './tsconfig.base.json',
        include: ['entry.ts', 'src/**/*.ts'],
      }),
    );

    expect(createImportResolver()('@/messages', importer)).toBe(target);
  });

  it('refreshes inherited paths after the extended config changes', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    const nextSourceRoot = path.join(root, 'next-source');
    fs.mkdirSync(sourceRoot);
    fs.mkdirSync(nextSourceRoot);
    const firstTarget = path.join(sourceRoot, 'messages.ts');
    const nextTarget = path.join(nextSourceRoot, 'messages.ts');
    fs.writeFileSync(firstTarget, "export const message = '继承配置'");
    fs.writeFileSync(nextTarget, "export const message = '更新配置'");
    const baseConfig = path.join(root, 'tsconfig.base.json');
    fs.writeFileSync(
      baseConfig,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
    );
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        extends: './tsconfig.base.json',
        include: ['entry.ts', 'src/**/*.ts', 'next-source/**/*.ts'],
      }),
    );
    const resolver = createImportResolver();
    expect(resolver('@/messages', importer)).toBe(firstTarget);

    fs.writeFileSync(
      baseConfig,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./next-source/*'] } },
      }),
    );
    expect(resolver('@/messages', importer)).toBe(nextTarget);
  });

  it('matches explicitly included Vue files and respects exclude', () => {
    const { root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    const excludedRoot = path.join(sourceRoot, 'excluded');
    fs.mkdirSync(excludedRoot, { recursive: true });
    const target = path.join(sourceRoot, 'messages.ts');
    const includedImporter = path.join(sourceRoot, 'View.vue');
    const excludedImporter = path.join(excludedRoot, 'View.vue');
    fs.writeFileSync(target, "export const message = 'Vue'");
    fs.writeFileSync(includedImporter, '');
    fs.writeFileSync(excludedImporter, '');
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['src/**/*.ts', 'src/**/*.vue'],
        exclude: ['src/excluded'],
      }),
    );

    expect(createImportResolver()('@/messages', includedImporter)).toBe(target);
    expect(createImportResolver()('@/messages', excludedImporter)).toBeNull();
  });

  it('accepts an explicit non-standard tsconfig path', () => {
    const { importer, root } = createFixture();
    const sourceRoot = path.join(root, 'src');
    const configRoot = path.join(root, 'configs');
    fs.mkdirSync(sourceRoot);
    fs.mkdirSync(configRoot);
    const target = path.join(sourceRoot, 'messages.ts');
    const tsconfigPath = path.join(configRoot, 'tsconfig.lint.json');
    fs.writeFileSync(target, "export const message = '手动配置'");
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          baseUrl: '..',
          paths: { '@/*': ['src/*'] },
        },
        include: ['../entry.ts', '../src/**/*.ts'],
      }),
    );

    expect(createImportResolver(tsconfigPath)('@/messages', importer)).toBe(
      target,
    );
  });
});
