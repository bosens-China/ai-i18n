import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import type { AiI18nPluginApi } from './plugin-api.js';

export const digest = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');

export function scanCandidates(files: Map<string, string>) {
  // 这些产物不参与候选增删保护；若实际被入口引用，仍由消费输入校验覆盖。
  return JSON.stringify(
    [...files.keys()]
      .filter(
        (file) =>
          !/\.d\.[cm]?ts$|\.tsbuildinfo$|\.log$/.test(file) &&
          !file
            .split(path.sep)
            .some((name) =>
              [
                '.agents',
                '.vscode',
                '.idea',
                '.gemini',
                '.claude',
                '.cache',
              ].includes(name),
            ),
      )
      .sort(),
  );
}

// 缺失路径可能是插件的虚拟模块；曾存在的文件变为 undefined 仍会使提交校验失败。
export async function scanFile(file: string) {
  try {
    const real = await fs.realpath(file);
    return digest(real + '\0' + digest(await fs.readFile(real)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** ponytail: 整树内容摘要省掉持久化依赖图；大仓库确有瓶颈时再做文件级摘要缓存。 */
export async function scanInputs(server: ViteDevServer, api: AiI18nPluginApi) {
  const config = server.config;
  let root = path.resolve(config.root);
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
  ].map((file) => path.resolve(file));
  const hash = createHash('sha256');
  const files = new Map<string, string>();
  let complete = true;
  const visited = new Set<string>();
  async function visit(file: string): Promise<void> {
    if (api.scanIgnores(file)) return;
    if (
      excluded.some(
        (entry) => file === entry || file.startsWith(entry + path.sep),
      )
    )
      return;
    try {
      const real = await fs.realpath(file);
      const stat = await fs.stat(real);
      if (stat.isDirectory()) {
        if (visited.has(real)) return;
        visited.add(real);
        try {
          for (const name of (await fs.readdir(real)).sort()) {
            if (['node_modules', '.git', '.turbo'].includes(name)) continue;
            await visit(path.join(file, name));
          }
        } finally {
          // 只阻止当前路径中的循环；不同别名仍是 glob 的独立候选。
          visited.delete(real);
        }
      } else if (stat.isFile()) {
        const value = await scanFile(file);
        if (value === undefined) complete = false;
        else files.set(file, value);
      }
    } catch (error) {
      if (
        !['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM', 'ELOOP'].includes(
          (error as NodeJS.ErrnoException).code ?? '',
        )
      )
        throw error;
      // 候选树不是依赖图：无关坏链接不能中断扫描，但不能据此复用旧清单。
      complete = false;
    }
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
    const value = await scanFile(file);
    if (value === undefined) complete = false;
    else files.set(path.resolve(file), value);
  }
  // 环境值只进入摘要，不能把密钥原文写入缓存。
  hash.update(
    JSON.stringify([
      2,
      config.root,
      config.mode,
      config.base,
      config.resolve.alias,
      config.define,
      config.env,
      process.env,
      api.scanOptions,
      config.plugins.map((plugin) => plugin.name),
      // 配置和解析输入即使不是 JS 模块，也必须保持稳定。
      [...files]
        .filter(([file]) =>
          /^(?:\.env(?:\..*)?|(?:ts|js)config.*\.json|package\.json|pnpm-(?:workspace\.yaml|lock\.yaml)|package-lock\.json|yarn\.lock)$/.test(
            path.basename(file),
          ),
        )
        .sort(),
    ]),
  );
  const context = hash.digest('hex');
  return {
    files,
    complete,
    context,
    hash: digest(JSON.stringify([context, [...files].sort()])),
  };
}

export function canReuseScan(server: ViteDevServer) {
  // 自定义转换插件可能读未声明的外部输入；无法证明有效时保守重扫。
  return server.config.plugins.every((plugin) =>
    /^(?:vite:|builtin:|ai-i18n(?::|$)|alias$)/.test(plugin.name),
  );
}
