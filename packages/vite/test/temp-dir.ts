import fs from 'node:fs/promises';

/**
 * Windows 下关闭 Vite Dev Server（chokidar watcher）后，底层文件句柄可能有短暂的
 * 释放延迟，直接 `fs.rm` 临时目录会偶发命中 `EBUSY`/`ENOTEMPTY`。这里复用 Node 内置的
 * 重试机制而不是自行 sleep，避免在无关平台上引入不必要的等待。
 */
export async function removeTempDir(directory: string): Promise<void> {
  await fs.rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
