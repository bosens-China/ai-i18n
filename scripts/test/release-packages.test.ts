import {
  collectExportTargets,
  createPublishManifest,
  parsePublishPaths,
  sortPackageEntries,
  validateInternalDependencies,
} from '../release-package-metadata.mjs';

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

  it('validates explicitly selected release package paths', () => {
    const allowed = ['packages/core', 'packages/vite'];
    expect(
      parsePublishPaths('["packages/vite","packages/core"]', allowed),
    ).toEqual(['packages/vite', 'packages/core']);
    expect(() =>
      parsePublishPaths('["packages/core","packages/core"]', allowed),
    ).toThrow('不重复');
    expect(() => parsePublishPaths('["packages/openai"]', allowed)).toThrow(
      '发布包路径',
    );
  });

  it('creates a dependency-ordered publish manifest with package paths', () => {
    const entries = [
      {
        manifest: {
          name: '@ai-i18n/vite',
          version: '1.0.0-alpha.2',
          dependencies: { '@ai-i18n/core': '1.0.0-alpha.1' },
        },
        tarball: '/tmp/ai-i18n-vite-1.0.0-alpha.2.tgz',
      },
      {
        manifest: { name: '@ai-i18n/core', version: '1.0.0-alpha.1' },
        tarball: '/tmp/ai-i18n-core-1.0.0-alpha.1.tgz',
      },
    ];
    expect(
      createPublishManifest(entries, [
        {
          manifest: { name: '@ai-i18n/vite' },
          relativePath: 'packages/vite',
        },
        {
          manifest: { name: '@ai-i18n/core' },
          relativePath: 'packages/core',
        },
      ]),
    ).toEqual([
      {
        name: '@ai-i18n/core',
        path: 'packages/core',
        tarball: 'ai-i18n-core-1.0.0-alpha.1.tgz',
        version: '1.0.0-alpha.1',
      },
      {
        name: '@ai-i18n/vite',
        path: 'packages/vite',
        tarball: 'ai-i18n-vite-1.0.0-alpha.2.tgz',
        version: '1.0.0-alpha.2',
      },
    ]);
  });
});
