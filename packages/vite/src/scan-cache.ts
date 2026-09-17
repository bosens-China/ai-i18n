import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import type { AiI18nPluginApi } from './plugin-api.js';

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/** ponytail: 整树内容摘要省掉持久化依赖图；大仓库确有瓶颈时再做文件级摘要缓存。 */
export async function scanInputs(server: ViteDevServer, api: AiI18nPluginApi) {
  const config = server.config;
  let root = config.root;
  for (let directory = root; ; directory = path.dirname(directory)) {
    if (
      await fs
        .stat(path.join(directory, 'pnpm-workspace.yaml'))
        .catch(() => null)
    ) {
      root = directory;
      break;
    }
    if (path.dirname(directory) === directory) break;
  }
  const excluded = [
    api.store().directory,
    config.cacheDir,
    path.resolve(config.root, config.build.outDir),
    ...api.scanIgnored,
  ];
  const hash = createHash('sha256');
  const visited = new Set<string>();
  async function visit(file: string): Promise<void> {
    if (api.scanIgnores(file)) return;
    if (
      excluded.some(
        (entry) => file === entry || file.startsWith(entry + path.sep),
      )
    )
      return;
    const real = await fs.realpath(file);
    hash.update(file);
    hash.update(real);
    if (visited.has(real)) return;
    visited.add(real);
    const stat = await fs.stat(real);
    if (stat.isDirectory()) {
      for (const name of (await fs.readdir(real)).sort()) {
        if (['node_modules', '.git', '.turbo'].includes(name)) continue;
        await visit(path.join(file, name));
      }
    } else if (stat.isFile()) hash.update(await fs.readFile(real));
  }
  await visit(root);
  hash.update(await fs.readFile(fileURLToPath(import.meta.url)));
  // 安装版本变化即失效，即使应用没有生成 lockfile。
  for (const name of [
    'vite',
    '@ai-i18n/vite',
    '@vitejs/plugin-vue',
    '@vitejs/plugin-react',
  ]) {
    const file = path.join(config.root, 'node_modules', name, 'package.json');
    hash.update(await fs.readFile(file).catch(() => Buffer.from(name)));
  }
  for (const file of config.configFileDependencies) {
    if (!visited.has(file)) await visit(file);
  }
  // 环境值只进入摘要，不能把密钥原文写入缓存。
  hash.update(
    JSON.stringify([
      1,
      config.root,
      config.mode,
      config.base,
      config.resolve.alias,
      config.define,
      config.env,
      process.env,
      api.scanOptions,
      config.plugins.map((plugin) => plugin.name),
    ]),
  );
  return { root, hash: hash.digest('hex') };
}

export function canReuseScan(server: ViteDevServer) {
  // 自定义转换插件可能读未声明的外部输入；无法证明有效时保守重扫。
  return server.config.plugins.every((plugin) =>
    /^(?:vite:|builtin:|ai-i18n(?::|$)|alias$)/.test(plugin.name),
  );
}
