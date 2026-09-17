import path from 'node:path';
import fs from 'node:fs/promises';
import { createServer, type InlineConfig, type PluginOption } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { aiI18nPluginApi } from './plugin-api.js';
import { ensureScan } from './scan-catalog.js';
import { scanWithDev } from './scan-bridge.js';
import {
  analyzeModule,
  findRuntimeImportDeclarations,
  findUnboundReferences,
} from './yuku-analyzer.js';

/** Skill 脚本入口：只转换入口依赖，不调用 Vite Build 或执行页面代码。 */
export async function scanProject(
  config: InlineConfig = {},
  entries?: readonly string[],
) {
  const server = await createServer({
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      {
        name: 'ai-i18n:scan',
        enforce: 'pre',
        async config(config) {
          // config hooks 先于全部 configResolved；必须在初始化 Provider/存储前切换。
          const plugins = await flattenPlugins(config.plugins ?? []);
          for (const plugin of plugins) {
            const api = aiI18nPluginApi(plugin);
            if (api) api.scanMode = true;
          }
          // 合并配置中的数组会追加，必须先清空已有的预热/预打包入口。
          if (config.optimizeDeps) config.optimizeDeps.include = [];
          if (config.server) config.server.warmup = {};
          return {
            root: await fs.realpath(path.resolve(config.root ?? process.cwd())),
            server: {
              middlewareMode: true,
              watch: null,
              hmr: false,
              ws: false,
              preTransformRequests: false,
              warmup: { clientFiles: [], ssrFiles: [] },
            },
            optimizeDeps: { noDiscovery: true, include: [] },
          };
        },
        transform: {
          filter: { id: /[?&]html-proxy(?:&|$)/ },
          handler(code, id) {
            if (!id.endsWith('.js')) return;
            const module = analyzeModule(code, `${id}.js`);
            if (
              findRuntimeImportDeclarations(module).length ||
              findUnboundReferences(
                module,
                new Set([
                  't',
                  'tRef',
                  'tComputed',
                  'useI18n',
                  'defineI18nMessages',
                ]),
              ).length
            ) {
              throw new Error(
                diagnosticMessage(
                  `[ai-i18n] 内联 HTML 脚本的翻译调用暂不参与源码提取，请将 ai-i18n 调用移到独立 JS/TS 模块：${id}。清单未提交。`,
                  `[ai-i18n] Inline HTML script translation calls are not extracted. Move ai-i18n calls to a separate JS/TS module: ${id}. Catalog was not committed.`,
                ),
              );
            }
          },
        },
        configResolved(resolved) {
          for (const environment of Object.values(resolved.environments)) {
            environment.optimizeDeps.noDiscovery = true;
            environment.optimizeDeps.include = [];
            environment.dev.warmup = [];
            environment.dev.preTransformRequests = false;
          }
        },
      },
    ],
  });
  try {
    const candidates = server.config.plugins.flatMap((plugin) => {
      const api = aiI18nPluginApi(plugin);
      return api ? [api] : [];
    });
    if (candidates.length !== 1 || !candidates[0]!.scanMode) {
      throw new Error(
        diagnosticMessage(
          '[ai-i18n] 扫描需要目标应用注册且只注册一个 aiI18n() 插件。',
          '[ai-i18n] Scanning requires exactly one aiI18n() plugin in the target app.',
        ),
      );
    }
    return (
      (await scanWithDev(server, entries)) ??
      (await ensureScan(server, candidates[0]!, entries))
    );
  } finally {
    await server.close();
  }
}

async function flattenPlugins(
  options: PluginOption[],
): Promise<import('vite').Plugin[]> {
  const result: import('vite').Plugin[] = [];
  for (const option of options) {
    const plugin = await option;
    if (Array.isArray(plugin)) result.push(...(await flattenPlugins(plugin)));
    else if (plugin) result.push(plugin);
  }
  return result;
}
