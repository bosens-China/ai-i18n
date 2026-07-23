import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export const examples = [
  ['vanilla', '@ai-i18n/example-vanilla'],
  ['vue', '@ai-i18n/example-vue'],
  ['react', '@ai-i18n/example-react'],
  ['mixed', '@ai-i18n/example-mixed'],
];

export function exampleBasePath(basePath, name) {
  const normalized = `/${basePath.replace(/^\/+|\/+$/g, '')}`;
  return `${normalized === '/' ? '' : normalized}/${name}/`;
}

export async function buildPages(root = process.cwd()) {
  const output = path.join(root, 'dist', 'pages');
  // Pages 项目页位于仓库名下，子示例必须各自使用对应的静态资源前缀。
  const basePath =
    process.env.PAGES_BASE_PATH ??
    `/${process.env.GITHUB_REPOSITORY?.split('/').at(-1) ?? 'ai-i18n'}/`;
  await fs.rm(output, { recursive: true, force: true });

  for (const [name, packageName] of examples) {
    const exampleRoot = path.join(root, 'examples', name);
    const target = path.join(output, name);
    execFileSync(
      'pnpm',
      [
        '--filter',
        packageName,
        'exec',
        'vite',
        'build',
        '--outDir',
        path.relative(exampleRoot, target),
        '--emptyOutDir',
        '--base',
        exampleBasePath(basePath, name),
      ],
      { cwd: root, stdio: 'inherit' },
    );
  }

  await fs.copyFile(
    path.join(root, 'examples', 'index.html'),
    path.join(output, 'index.html'),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  await buildPages();
}
