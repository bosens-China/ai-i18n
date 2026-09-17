import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 官方尚未定义插件路径变量；在实际安装位置生成绝对命令，避免依赖任务 cwd。
const quote = (value) =>
  process.platform === 'win32'
    ? `"${value.replaceAll('"', '""')}"`
    : `'${value.replaceAll("'", "'\\''")}'`;
await fs.writeFile(
  path.join(root, 'hooks.json'),
  JSON.stringify(
    {
      'ai-i18n': {
        Stop: [
          {
            type: 'command',
            timeout: 120,
            command: `${quote(process.execPath)} ${quote(path.join(root, 'scripts/stop.mjs'))} antigravity`,
          },
        ],
      },
    },
    null,
    2,
  ) + '\n',
);
