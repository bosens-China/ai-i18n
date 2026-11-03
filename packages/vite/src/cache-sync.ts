import fs from 'node:fs/promises';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import {
  openTranslationMemoryStore,
  readTranslationOverrides,
  translationMemoryCandidates,
  withFileQueue,
} from '@ai-i18n/core/translation-memory';
import { loadAiI18nConfig } from './config.js';

/** MCP 只解析配置并同步已提交文件，不启动 Dev、不提取源码、不调用 Provider。 */
export async function syncProjectCache(
  appDirectory: string,
  i18nDirectory: string,
  selection: {
    config_file?: string;
    config_mode?: string;
    config_command?: 'serve' | 'build';
  } = {},
): Promise<void> {
  const { options } = await loadAiI18nConfig(
    selection.config_file ?? path.join(appDirectory, 'ai-i18n.config.ts'),
    {
      command: selection.config_command ?? 'serve',
      mode:
        selection.config_mode ??
        (selection.config_command === 'build' ? 'production' : 'development'),
    },
  );
  const adapter =
    options.remote?.load && options.remote.mode !== 'overlay'
      ? undefined
      : options.translationMemory?.cache;
  if (!adapter) return;
  const directory = await fs.realpath(i18nDirectory);
  if (directory !== (await fs.realpath(options.directory!)))
    throw new Error(
      diagnosticMessage(
        '翻译目录与应用配置不一致。',
        'Translation directory does not match the app configuration.',
      ),
    );
  await withFileQueue(path.join(directory, '.cache-sync'), async () => {
    const store = await openTranslationMemoryStore(directory);
    let cache:
      Awaited<ReturnType<NonNullable<typeof adapter>['open']>> | undefined;
    try {
      cache = await adapter.open(directory);
      const memory = await store.load();
      const overrides = await readTranslationOverrides(
        path.join(directory, 'overrides'),
      );
      await cache.sync(
        translationMemoryCandidates(
          memory.messages,
          overrides,
          options.sourceLang,
        ),
      );
    } finally {
      cache?.close();
      await store.close();
    }
  });
}
