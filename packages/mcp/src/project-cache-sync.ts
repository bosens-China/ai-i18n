import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';

export async function syncProjectCacheAfterWrite(
  i18nDirectory: string,
  appDirectory?: string,
): Promise<void> {
  try {
    let directory = appDirectory ?? i18nDirectory;
    if (!appDirectory) {
      while (
        !(await fs.readdir(directory)).some((name) =>
          /^vite\.config\.[cm]?[jt]s$/.test(name),
        )
      ) {
        const parent = path.dirname(directory);
        if (parent === directory) return;
        directory = parent;
      }
    }
    const resolver = createRequire(
      path.join(directory, '.ai-i18n-cache-resolve.cjs'),
    );
    const adapter = (await import(
      pathToFileURL(resolver.resolve('@ai-i18n/vite/internal/scan')).href
    )) as {
      syncProjectCache: (app: string, i18n: string) => Promise<void>;
    };
    await adapter.syncProjectCache(directory, i18nDirectory);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    process.stderr.write(
      diagnosticMessage(
        `[ai-i18n] 项目写入成功，但个人缓存同步失败：${reason}。下次 Dev/Build 会重试。`,
        `[ai-i18n] Project write succeeded, but personal cache synchronization failed: ${reason}. The next Dev/Build will retry.`,
      ) + '\n',
    );
  }
}
