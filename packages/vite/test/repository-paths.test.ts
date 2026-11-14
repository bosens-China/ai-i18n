import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import {
  fileId,
  fileMessageKey,
  repositoryPath,
} from '../src/repository-paths.js';

test('uses repo-relative file identities across app roots and worktree paths', async () => {
  const roots: string[] = [];
  try {
    for (let index = 0; index < 2; index++) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-path-'));
      roots.push(root);
      await fs.writeFile(path.join(root, '.git'), 'gitdir: local');
    }
    const paths = roots.map((root) => {
      const app = path.join(root, 'apps/web');
      const file = path.join(app, 'src/Settings.vue');
      return {
        relative: repositoryPath(app, file),
        id: fileId(app, file),
      };
    });
    expect(paths[0]).toEqual(paths[1]);
    expect(paths[0]?.relative).toBe('apps/web/src/Settings.vue');
    expect(fileMessageKey(paths[0]!.id, '保存#按钮')).toMatch(
      /^f:[0-9a-f]{16}:保存#按钮$/,
    );
  } finally {
    for (const root of roots)
      await fs.rm(root, { recursive: true, force: true });
  }
});
