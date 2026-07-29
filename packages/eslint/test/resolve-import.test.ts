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

  it('reuses tsconfig parsing and refreshes it after the file changes', () => {
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
    const readFile = vi.spyOn(fs, 'readFileSync');
    const configReads = () =>
      readFile.mock.calls.filter(([filename]) => filename === tsconfigPath)
        .length;

    expect(createImportResolver(tsconfigPath)('@/value', importer)).toBe(
      path.join(sourceRoot, 'value.ts'),
    );
    expect(configReads()).toBe(1);
    createImportResolver(tsconfigPath);
    expect(configReads()).toBe(1);

    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['next-source/*'] } },
      }),
    );
    expect(createImportResolver(tsconfigPath)('@/value', importer)).toBe(
      path.join(nextSourceRoot, 'value.ts'),
    );
    expect(configReads()).toBe(2);
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
});
