import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';

export async function syncProjectCacheAfterWrite(
  i18nDirectory: string,
  appDirectory?: string,
  selection: {
    config_file?: string;
    config_mode?: string;
    config_command?: 'serve' | 'build';
  } = {},
): Promise<void> {
  try {
    let directory = selection.config_file
      ? path.dirname(selection.config_file)
      : (appDirectory ?? i18nDirectory);
    if (!appDirectory && !selection.config_file) {
      while (
        !(await fs.readdir(directory)).some(
          (name) => name === 'ai-i18n.config.ts',
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
      syncProjectCache: (
        app: string,
        i18n: string,
        options: {
          config_file?: string;
          config_mode?: string;
          config_command?: 'serve' | 'build';
        },
      ) => Promise<void>;
    };
    await adapter.syncProjectCache(directory, i18nDirectory, selection);
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
