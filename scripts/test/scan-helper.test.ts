import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';

const exec = promisify(execFile);
it.each([false, true])(
  'exits despite plugin handles (failure=%s)',
  async (failure) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-scan-exit-'));
    try {
      const pkg = path.join(root, 'node_modules/@ai-i18n/vite');
      await fs.mkdir(pkg, { recursive: true });
      await fs.writeFile(path.join(root, 'package.json'), '{}');
      await fs.writeFile(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          type: 'module',
          exports: { './internal/scan': './scan.mjs' },
        }),
      );
      // 模拟第三方插件遗留监听句柄，并让输出超过管道缓冲区。
      const output = '扫描结果'.repeat(32_768);
      await fs.writeFile(
        path.join(pkg, 'scan.mjs'),
        `
      export async function scanProject() {
        setInterval(() => {}, 1000);
        await new Promise(resolve => setTimeout(resolve, 20));
        ${failure ? `throw new Error(${JSON.stringify(output)});` : `return { output: ${JSON.stringify(output)} };`}
      }
    `,
      );
      const result = await exec(
        process.execPath,
        [
          path.resolve('.agents/skills/use-ai-i18n-mcp/scripts/scan.mjs'),
          '--root',
          root,
        ],
        { timeout: 2000, maxBuffer: 2 * 1024 * 1024 },
      ).then(
        (value) => ({ ...value, code: 0, killed: false }),
        (error: {
          code: number;
          killed: boolean;
          stdout: string;
          stderr: string;
        }) => error,
      );
      expect(result.killed).toBe(false);
      expect(result.code).toBe(failure ? 1 : 0);
      if (failure) expect(result.stderr).toBe(`${output}\n`);
      else expect(JSON.parse(result.stdout)).toEqual({ output });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);
