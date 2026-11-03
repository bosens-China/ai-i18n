import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { discoverProjects, resolveProject } from '../src/project-discovery';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
it('discovers multiple apps without executing configs or traversing generated directories and links', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-discover-'));
  roots.push(root);
  for (const dir of [
    'apps/web',
    'apps/admin',
    'node_modules/vendor',
    'dist',
    'i18n',
    '.git',
  ]) {
    await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.writeFile(
      path.join(root, dir, 'ai-i18n.config.ts'),
      "throw new Error('must not execute');",
    );
  }
  await fs.symlink(
    path.join(root, 'apps'),
    path.join(root, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const result = await discoverProjects(root);
  expect(result.projects.map((p) => path.basename(p.app_directory))).toEqual([
    'admin',
    'web',
  ]);
  expect(result.truncated).toBe(false);
  await expect(discoverProjects('.')).rejects.toMatchObject({
    code: 'WORKSPACE_DIRECTORY_NOT_ABSOLUTE',
  });
});
it('resolves only the selected config without loading Vite config or calling Provider', async () => {
  // 使用同卷临时目录，避免 Windows 跨盘 junction 不可解析。
  const root = await fs.mkdtemp(
    path.resolve('packages/mcp/node_modules/.config-test-'),
  );
  roots.push(root);
  await fs.mkdir(path.join(root, 'node_modules/@ai-i18n'), { recursive: true });
  await fs.symlink(
    path.resolve('packages/vite'),
    path.join(root, 'node_modules/@ai-i18n/vite'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await fs.writeFile(
    path.join(root, 'vite.config.ts'),
    "throw new Error('Vite config must not execute');",
  );
  await fs.mkdir(path.join(root, 'app'));
  const file = path.join(root, 'ai-i18n.config.ts');
  await fs.writeFile(
    file,
    `export default ({mode}) => ({root:'app', directory:mode==='internal'?'translations-internal':'i18n', sourceLang:'zh',locales:[{value:'zh',label:'中文'},{value:'en',label:'English'}],provider:{translator(){throw new Error('Provider must not run');}}});`,
  );
  const result = await resolveProject(file, 'build', 'internal');
  expect(result.vite_root).toBe(path.join(root, 'app'));
  expect(result.i18n_directory).toBe(path.join(root, 'translations-internal'));
  expect(result.translation_source).toBe('local');
  expect(JSON.stringify(result)).not.toContain('translator');
});
