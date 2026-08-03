import {
  collectExportTargets,
  sortPackageEntries,
  validateInternalDependencies,
} from '../release-packages.mjs';

function entry(name: string, dependencies: Record<string, string> = {}) {
  return {
    manifest: { name, dependencies },
    tarball: `${name}.tgz`,
  };
}

describe('release package verification', () => {
  it('collects every file-backed public entry', () => {
    expect(
      collectExportTargets({
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
          '.': {
            import: './dist/index.js',
            types: './dist/index.d.ts',
          },
          './diagnostics': './dist/diagnostics.js',
        },
      }),
    ).toEqual([
      './dist/diagnostics.js',
      './dist/index.d.ts',
      './dist/index.js',
    ]);
  });

  it('rejects floating internal release dependencies', () => {
    expect(() =>
      validateInternalDependencies(
        {
          name: '@ai-i18n/analyzer',
          dependencies: { '@ai-i18n/core': '^1.0.0-alpha.6' },
        },
        new Map([['@ai-i18n/core', '1.0.0-alpha.6']]),
      ),
    ).toThrow('必须精确依赖');
  });

  it('orders dependencies before their consumers', () => {
    const sorted = sortPackageEntries([
      entry('@ai-i18n/eslint-plugin', {
        '@ai-i18n/analyzer': '1.0.0-alpha.11',
      }),
      entry('@ai-i18n/core'),
      entry('@ai-i18n/analyzer', {
        '@ai-i18n/core': '1.0.0-alpha.6',
      }),
    ]);
    expect(sorted.map(({ manifest }) => manifest.name)).toEqual([
      '@ai-i18n/core',
      '@ai-i18n/analyzer',
      '@ai-i18n/eslint-plugin',
    ]);
  });

  it('rejects cyclic release dependencies', () => {
    expect(() =>
      sortPackageEntries([
        entry('@ai-i18n/core', { '@ai-i18n/analyzer': '1.0.0-alpha.11' }),
        entry('@ai-i18n/analyzer', { '@ai-i18n/core': '1.0.0-alpha.6' }),
      ]),
    ).toThrow('存在循环');
  });
});
