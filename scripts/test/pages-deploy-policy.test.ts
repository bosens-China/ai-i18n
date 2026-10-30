import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  renameSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectStandalonePagesChange,
  shouldDeployStandalonePages,
} from '../pages-deploy-policy.js';

describe('standalone Pages change policy', () => {
  it.each([
    ['apps/docs/docs/guide/example.md'],
    ['apps/docs/docs/public/logo.svg'],
    ['apps/docs/components/DemoFrame.tsx'],
    ['apps/docs/rspress.config.ts'],
    ['apps/docs/package.json'],
    ['.github/workflows/pages.yml'],
    ['examples/shared/base.css'],
    ['examples/react/src/App.tsx'],
    ['examples/vue/i18n/translations/en-US/0.json'],
    ['examples/vanilla/public/favicon.png'],
  ])('deploys published site input %s', (file) => {
    expect(shouldDeployStandalonePages([file])).toBe(true);
  });

  it.each([
    ['docs/PRD.md'],
    ['README.md'],
    ['apps/docs/README.md'],
    ['examples/react/README.md'],
    ['examples/vue/test/app.test.ts'],
    ['examples/remote/src/main.ts'],
    ['packages/core/README.md'],
    ['packages/core/test/runtime.test.ts'],
    ['.agents/skills/integrate-ai-i18n/SKILL.md'],
  ])('does not deploy unrelated change %s', (file) => {
    expect(shouldDeployStandalonePages([file])).toBe(false);
  });

  it('holds mixed package implementation and site changes for a release', () => {
    for (const file of [
      'packages/core/src/runtime.ts',
      'packages/vite/package.json',
    ]) {
      expect(
        shouldDeployStandalonePages(['apps/docs/docs/index.md', file]),
      ).toBe(false);
    }
  });

  it('allows site updates with package docs and tests, but ignores empty changes', () => {
    expect(
      shouldDeployStandalonePages([
        'apps/docs/docs/index.md',
        'packages/core/README.md',
        'packages/core/src/test/runtime.test.ts',
      ]),
    ).toBe(true);
    expect(shouldDeployStandalonePages([])).toBe(false);
  });
});

describe('Git push comparison', () => {
  const gitEnvironmentVariables = execFileSync(
    'git',
    ['rev-parse', '--local-env-vars'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n');
  let root: string;
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };
  const commit = (message: string) => {
    git('add', '-A');
    git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-m',
      message,
    );
    return git('rev-parse', 'HEAD');
  };

  beforeEach(() => {
    // 提交钩子会注入临时索引等 Git 上下文，外部测试仓库不能继承这些变量。
    for (const variable of gitEnvironmentVariables) {
      vi.stubEnv(variable, undefined);
    }
    root = mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-pages-'));
    git('init', '--initial-branch=main');
    write('README.md', 'fixture');
    commit('chore: fixture');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('includes earlier code commits even when the last commit is docs', () => {
    const before = git('rev-parse', 'HEAD');
    write('packages/core/src/runtime.ts', 'export const value = 1;');
    commit('feat(core): update runtime');
    write('apps/docs/docs/index.md', 'docs');
    const after = commit('docs: update guide');
    expect(detectStandalonePagesChange(before, after, root)).toBe(false);
  });

  it('supports deletion and filenames containing spaces or newlines', () => {
    const file = 'apps/docs/docs/old page\nname.md';
    write(file, 'docs');
    const before = commit('docs: add page');
    rmSync(path.join(root, file));
    const after = commit('docs: remove page');
    expect(detectStandalonePagesChange(before, after, root)).toBe(true);
  });

  it('does not hide package deletions behind a cross-directory rename', () => {
    write('packages/core/src/runtime.ts', 'unchanged content');
    const before = commit('feat(core): add runtime');
    mkdirSync(path.join(root, 'apps/docs/docs'), { recursive: true });
    renameSync(
      path.join(root, 'packages/core/src/runtime.ts'),
      path.join(root, 'apps/docs/docs/runtime.md'),
    );
    const after = commit('docs: move file');
    expect(detectStandalonePagesChange(before, after, root)).toBe(false);
  });

  it('does not deploy an empty, invalid or initial branch comparison', () => {
    const sha = git('rev-parse', 'HEAD');
    expect(detectStandalonePagesChange(sha, sha, root)).toBe(false);
    for (const before of ['', '--output=unexpected', '0'.repeat(40)]) {
      expect(detectStandalonePagesChange(before, sha, root)).toBe(false);
    }
    expect(() =>
      detectStandalonePagesChange('f'.repeat(40), sha, root),
    ).toThrow();
  });
});
