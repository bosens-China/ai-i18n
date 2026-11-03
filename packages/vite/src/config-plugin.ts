import path from 'node:path';
import fs from 'node:fs/promises';
import { normalizePath, type Plugin } from 'vite';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import { loadAiI18nConfig } from './config.js';
import { aiI18n as createPlugin } from './plugin.js';
import { aiI18nPluginApi } from './plugin-api.js';

export interface AiI18nPluginOptions {
  configFile?: string;
}

export function aiI18n(input: AiI18nPluginOptions = {}): Plugin {
  if (Object.keys(input).some((key) => key !== 'configFile'))
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 请将业务配置移到 ai-i18n.config.ts；aiI18n() 仅接受 configFile。',
        '[ai-i18n] Move options to ai-i18n.config.ts; aiI18n() only accepts configFile.',
      ),
    );
  const configure: Plugin['config'] = {
    order: 'pre',
    async handler(config, env) {
      const root = path.resolve(config.root ?? process.cwd());
      const loaded = await loadAiI18nConfig(
        path.resolve(root, input.configFile ?? 'ai-i18n.config.ts'),
        env,
      );
      const inner = createPlugin(
        loaded.options,
        path.dirname(loaded.configFile),
      );
      aiI18nPluginApi(inner)!.configFile = loaded.configFile;
      // 在 config 阶段安装实际 hooks，保留加载入口以支持同实例重启。
      Object.assign(plugin, inner, { config: configure });
      plugin.configResolved = async function (resolved) {
        if ((await fs.realpath(resolved.root)) !== loaded.root)
          throw new Error(
            diagnosticMessage(
              `[ai-i18n] 配置 root 与 Vite root 不一致：${loaded.root} / ${resolved.root}。`,
              `[ai-i18n] Config root does not match Vite root: ${loaded.root} / ${resolved.root}.`,
            ),
          );
        resolved.configFileDependencies.push(
          ...loaded.dependencies.map(normalizePath),
        );
        if (typeof inner.configResolved === 'function')
          await inner.configResolved.call(this, resolved);
      };
      if (typeof inner.config === 'function')
        return inner.config.call(this, config, env);
    },
  };
  const plugin: Plugin = { name: 'ai-i18n', enforce: 'pre', config: configure };
  return plugin;
}
