import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function shouldDeployStandalonePages(files: readonly string[]): boolean {
  const siteChanged = files.some(
    (file) =>
      file.startsWith('apps/docs/docs/') ||
      file.startsWith('apps/docs/components/') ||
      [
        'apps/docs/rspress.config.ts',
        'apps/docs/package.json',
        '.github/workflows/pages.yml',
      ].includes(file) ||
      (/^examples\/(react|vue|vanilla|shared)\//.test(file) &&
        !file.endsWith('.md') &&
        !file.includes('/test/')),
  );
  const packageChanged = files.some(
    (file) =>
      file.startsWith('packages/') &&
      !file.endsWith('.md') &&
      !file.includes('/test/'),
  );
  return siteChanged && !packageChanged;
}

export function detectStandalonePagesChange(
  before: string,
  after: string,
  cwd = process.cwd(),
): boolean {
  if (
    !/^[a-f0-9]{40}$/.test(before) ||
    !/^[a-f0-9]{40}$/.test(after) ||
    /^0+$/.test(before)
  ) {
    return false;
  }
  // 检查整次 push；将重命名展开为删除和新增，防止包代码移入文档目录后被误判。
  const files = execFileSync(
    'git',
    ['diff', '--no-renames', '--name-only', '-z', before, after, '--'],
    { cwd, encoding: 'utf8', stdio: 'pipe' },
  )
    .split('\0')
    .filter(Boolean);
  return shouldDeployStandalonePages(files);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [before = '', after = ''] = process.argv.slice(2);
  console.log(`pages_only=${detectStandalonePagesChange(before, after)}`);
}
