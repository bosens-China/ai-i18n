import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { tStaticArgs } from '../index';
import { createImportResolver } from '../resolve-import';

const temporaryRoots: string[] = [];
const jsRuleRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), 'ai-i18n-alias-rule-'),
);
const jsRuleSourceRoot = path.join(jsRuleRoot, 'src');
fs.mkdirSync(jsRuleSourceRoot);
fs.writeFileSync(
  path.join(jsRuleSourceRoot, 'bridge.js'),
  "export { t } from 'virtual:ai-i18n'",
);

afterAll(() => {
  fs.rmSync(jsRuleRoot, { force: true, recursive: true });
});

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

function createFixture(extension = 'ts') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-config-'));
  temporaryRoots.push(root);
  const importer = path.join(root, `entry.${extension}`);
  fs.writeFileSync(importer, '');
  return { importer, root };
}

describe('ESLint resolver configuration', () => {
  it('uses the first matching alias before tsconfig paths', () => {
    const { importer, root } = createFixture();
    const aliasRoot = path.join(root, 'alias');
    const specificRoot = path.join(root, 'specific');
    const tsconfigRoot = path.join(root, 'tsconfig-source');
    fs.mkdirSync(path.join(aliasRoot, 'feature'), { recursive: true });
    fs.mkdirSync(specificRoot);
    fs.mkdirSync(path.join(tsconfigRoot, 'feature'), { recursive: true });
    const aliasTarget = path.join(aliasRoot, 'feature', 'messages.js');
    const exactTarget = path.join(root, 'exact.js');
    fs.writeFileSync(aliasTarget, "export const message = 'alias'");
    fs.writeFileSync(exactTarget, "export const message = 'exact'");
    fs.writeFileSync(
      path.join(specificRoot, 'messages.js'),
      "export const message = 'specific'",
    );
    fs.writeFileSync(
      path.join(tsconfigRoot, 'feature', 'messages.js'),
      "export const message = 'tsconfig'",
    );
    const tsconfigPath = path.join(root, 'tsconfig.json');
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: {
          allowJs: true,
          paths: {
            '@/*': ['./tsconfig-source/*'],
            '#/*': ['./tsconfig-source/*'],
          },
        },
        include: ['**/*'],
      }),
    );

    const resolve = createImportResolver(tsconfigPath, {
      '@': aliasRoot,
      '@/feature': specificRoot,
      '@entry': exactTarget,
    });
    expect(resolve('@/feature/messages', importer)).toBe(aliasTarget);
    expect(resolve('@entry', importer)).toBe(exactTarget);
    expect(resolve('@feature/messages', importer)).toBeNull();
    expect(resolve('#/feature/messages', importer)).toBe(
      path.join(tsconfigRoot, 'feature', 'messages.js'),
    );
  });

  it('rejects empty alias keys and relative replacements', () => {
    expect(() =>
      createImportResolver(undefined, { '': process.cwd() }),
    ).toThrow(TypeError);
    expect(() => createImportResolver(undefined, { '@': './src' })).toThrow(
      TypeError,
    );
  });

  it('does not fall back when a matching alias target is missing', () => {
    const { importer, root } = createFixture();
    const aliasRoot = path.join(root, 'missing-alias');
    const tsconfigRoot = path.join(root, 'tsconfig-source');
    fs.mkdirSync(aliasRoot);
    fs.mkdirSync(tsconfigRoot);
    fs.writeFileSync(
      path.join(tsconfigRoot, 'messages.ts'),
      "export const message = 'tsconfig'",
    );
    const tsconfigPath = path.join(root, 'tsconfig.json');
    fs.writeFileSync(
      tsconfigPath,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./tsconfig-source/*'] } },
        include: ['**/*.ts'],
      }),
    );

    expect(
      createImportResolver(tsconfigPath, { '@': aliasRoot })(
        '@/messages',
        importer,
      ),
    ).toBeNull();
  });

  it('discovers jsconfig for JavaScript without an explicit allowJs', () => {
    const { importer, root } = createFixture('js');
    const sourceRoot = path.join(root, 'src');
    fs.mkdirSync(sourceRoot);
    const target = path.join(sourceRoot, 'messages.js');
    fs.writeFileSync(target, "export const message = 'JavaScript'");
    fs.writeFileSync(
      path.join(root, 'jsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['**/*.js'],
      }),
    );

    expect(createImportResolver()('@/messages', importer)).toBe(target);
  });

  it('prefers the nearest config, then tsconfig over jsconfig', () => {
    const { root } = createFixture();
    const appRoot = path.join(root, 'app');
    const nestedRoot = path.join(appRoot, 'nested');
    const tsRoot = path.join(appRoot, 'ts-source');
    const jsRoot = path.join(appRoot, 'js-source');
    const nestedSourceRoot = path.join(nestedRoot, 'src');
    fs.mkdirSync(nestedSourceRoot, { recursive: true });
    fs.mkdirSync(tsRoot);
    fs.mkdirSync(jsRoot);
    const appImporter = path.join(appRoot, 'entry.js');
    const nestedImporter = path.join(nestedRoot, 'entry.js');
    fs.writeFileSync(appImporter, '');
    fs.writeFileSync(nestedImporter, '');
    const tsTarget = path.join(tsRoot, 'messages.js');
    const nestedTarget = path.join(nestedSourceRoot, 'messages.js');
    fs.writeFileSync(tsTarget, "export const message = 'tsconfig'");
    fs.writeFileSync(
      path.join(jsRoot, 'messages.js'),
      "export const message = 'jsconfig'",
    );
    fs.writeFileSync(nestedTarget, "export const message = 'nearest'");
    fs.writeFileSync(
      path.join(appRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          allowJs: true,
          paths: { '@/*': ['./ts-source/*'] },
        },
        include: ['**/*.js'],
      }),
    );
    fs.writeFileSync(
      path.join(appRoot, 'jsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./js-source/*'] } },
        include: ['**/*.js'],
      }),
    );
    fs.writeFileSync(
      path.join(nestedRoot, 'jsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['**/*.js'],
      }),
    );

    expect(createImportResolver()('@/messages', appImporter)).toBe(tsTarget);
    expect(createImportResolver()('@/messages', nestedImporter)).toBe(
      nestedTarget,
    );
  });

  it('accepts jsconfig through the explicit tsconfigPath option', () => {
    const { importer, root } = createFixture('js');
    const sourceRoot = path.join(root, 'src');
    fs.mkdirSync(sourceRoot);
    const target = path.join(sourceRoot, 'messages.js');
    fs.writeFileSync(target, "export const message = 'JavaScript'");
    const jsconfigPath = path.join(root, 'jsconfig.json');
    fs.writeFileSync(
      jsconfigPath,
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
        include: ['**/*.js'],
      }),
    );

    expect(createImportResolver(jsconfigPath)('@/messages', importer)).toBe(
      target,
    );
  });
});

describe('ESLint alias settings in JavaScript', () => {
  const tester = new RuleTester({
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  });

  tester.run('t-static-args', tStaticArgs, {
    valid: [],
    invalid: [
      {
        code: "import { t } from '@/bridge'; t(props.label)",
        filename: path.join(jsRuleSourceRoot, 'entry.js'),
        settings: {
          'ai-i18n': {
            alias: { '@': jsRuleSourceRoot },
          },
        },
        errors: [{ messageId: 'invalidUsage' }],
      },
    ],
  });
});
