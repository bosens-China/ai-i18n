import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const tempDirectories: string[] = [];

export async function cleanupFixtures(): Promise<void> {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
}

export async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-mcp-'));
  tempDirectories.push(root);
  const directory = path.join(root, 'apps/web/i18n');
  await fs.mkdir(path.join(directory, 'extracted'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'translations.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      messages: {
        保存: {
          source: '保存',
          sourceLang: 'zh-CN',
          translations: { 'en-US': null, 'ja-JP': '保存する' },
        },
        退出: {
          source: '退出',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Exit', 'ja-JP': null },
        },
      },
    }),
  );
  await fs.writeFile(
    path.join(directory, 'overrides.json'),
    JSON.stringify({ version: 1, messages: {} }),
  );
  await fs.writeFile(
    path.join(directory, 'extracted/src_home.ts.json'),
    JSON.stringify({
      version: 1,
      source: 'src/home.ts',
      messages: [
        {
          id: '保存',
          source: '保存',
          locations: [{ line: 1, column: 0 }],
        },
        {
          id: '退出',
          source: '退出',
          locations: [{ line: 2, column: 0 }],
        },
      ],
    }),
  );
  return root;
}
