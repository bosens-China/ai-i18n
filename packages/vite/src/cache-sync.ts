import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveConfig, type PluginOption } from 'vite';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import {
  openTranslationMemoryStore,
  readTranslationOverrides,
  translationMemoryCandidates,
  withFileLock,
} from '@ai-i18n/core/translation-memory';
import { aiI18nPluginApi } from './plugin-api.js';

/** MCP 只解析配置并同步已提交文件，不启动 Dev、不提取源码、不调用 Provider。 */
export async function syncProjectCache(
  appDirectory: string,
  i18nDirectory: string,
): Promise<void> {
  const resolved = await resolveConfig(
    {
      root: appDirectory,
      logLevel: 'silent',
      plugins: [
        {
          name: 'ai-i18n:cache-sync',
          enforce: 'pre',
          async config(config) {
            async function visit(plugins: PluginOption[]): Promise<void> {
              for (const option of plugins) {
                const plugin = await option;
                if (Array.isArray(plugin)) await visit(plugin);
                else if (plugin) {
                  const api = aiI18nPluginApi(plugin);
                  if (api) api.cacheMode = true;
                }
              }
            }
            await visit(config.plugins ?? []);
          },
        },
      ],
    },
    'serve',
  );
  const apis = resolved.plugins.flatMap((plugin) => {
    const api = aiI18nPluginApi(plugin);
    return api ? [api] : [];
  });
  if (apis.length !== 1 || !apis[0]!.cacheMode)
    throw new Error(
      diagnosticMessage(
        '缓存同步需要恰好一个 aiI18n 插件。',
        'Cache synchronization requires exactly one aiI18n plugin.',
      ),
    );
  const api = apis[0]!;
  if (!api.cacheOptions.adapter) return;
  const directory = await fs.realpath(i18nDirectory);
  if (
    directory !==
    (await fs.realpath(
      path.resolve(resolved.root, api.cacheOptions.directory ?? 'i18n'),
    ))
  )
    throw new Error(
      diagnosticMessage(
        '翻译目录与应用配置不一致。',
        'Translation directory does not match the app configuration.',
      ),
    );
  await withFileLock(path.join(directory, '.cache-sync'), async () => {
    const store = await openTranslationMemoryStore(directory);
    let cache:
      | Awaited<
          ReturnType<NonNullable<typeof api.cacheOptions.adapter>['open']>
        >
      | undefined;
    try {
      cache = await api.cacheOptions.adapter!.open(directory);
      const memory = await store.load();
      const overrides = await readTranslationOverrides(
        path.join(directory, 'overrides'),
      );
      await cache.sync(
        translationMemoryCandidates(
          memory.messages,
          overrides,
          api.options.sourceLang,
        ),
      );
    } finally {
      cache?.close();
      await store.close();
    }
  });
}
