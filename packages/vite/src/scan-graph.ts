import fs from 'node:fs/promises';
import path from 'node:path';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { analyzeModule, diagnosticMessage } from '@ai-i18n/analyzer';
import {
  findRuntimeImportDeclarations,
  findUnboundReferences,
} from './yuku-analyzer.js';
import { normalizePath, type ResolvedConfig, type ViteDevServer } from 'vite';

export function scanEntries(
  config: ResolvedConfig,
  entries?: readonly string[],
): string[] {
  const input =
    entries ??
    config.build.rolldownOptions.input ??
    (config.build.lib ? config.build.lib.entry : undefined) ??
    'index.html';
  const values =
    typeof input === 'string'
      ? [input]
      : Array.isArray(input)
        ? input
        : Object.values(input);
  if (
    !values.length ||
    values.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 扫描入口不能为空。',
        '[ai-i18n] Scan entries must not be empty.',
      ),
    );
  }
  return [...new Set(values.map((entry) => path.resolve(config.root, entry)))];
}

export async function walkScanGraph(
  server: ViteDevServer,
  entries: readonly string[],
  trackFile?: (file: string) => Promise<void>,
) {
  const environment = server.environments.client;
  if (!environment)
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 扫描需要 Vite client 环境。',
        '[ai-i18n] Scanning requires a Vite client environment.',
      ),
    );
  const queue: string[] = [];
  const visited = new Set<string>();
  const files = new Set<string>(entries);
  for (const file of entries) {
    await trackFile?.(file);
    if (!file.endsWith('.html')) {
      queue.push(`/@fs/${normalizePath(file)}`);
      continue;
    }
    const url = '/' + normalizePath(path.relative(server.config.root, file));
    const source = await fs.readFile(file, 'utf8');
    validateInlineScripts(parse(source), file);
    const html = await server.transformIndexHtml(url, source);
    const document = parse(html);
    validateInlineScripts(document, file);
    const collect = (node: DefaultTreeAdapterTypes.Node) => {
      if ('tagName' in node && node.tagName === 'script') {
        const type = node.attrs.find((attr) => attr.name === 'type')?.value;
        const src = node.attrs.find((attr) => attr.name === 'src')?.value;
        if (type === 'module' && src) {
          if (/^(?:https?:)?\/\//.test(src)) return;
          queue.push(
            src.startsWith('/')
              ? src
              : path.posix.join(path.posix.dirname(url), src),
          );
        }
      }
      if ('childNodes' in node) node.childNodes.forEach(collect);
    };
    collect(document);
  }
  for (let index = 0; index < queue.length; index++) {
    const rawUrl = queue[index]!;
    // transformRequest 接收去除部署 base 的模块 URL（HTTP 中间件通常负责此步）。
    const base = server.config.base;
    const url =
      base !== '/' && rawUrl.startsWith(base)
        ? '/' + rawUrl.slice(base.length)
        : rawUrl;
    if (visited.has(url)) continue;
    visited.add(url);
    const node = await environment.moduleGraph.ensureEntryFromUrl(url);
    const id = node.id ?? '';
    if (
      id.includes('/node_modules/') ||
      id.includes('virtual:ai-i18n') ||
      id.includes('__ai-i18n/') ||
      id.includes('/@vite/') ||
      // React Refresh 自带运行时动态导入，不属于应用文案依赖。
      id === '/@react-refresh' ||
      node.type === 'css'
    )
      continue;
    if (path.isAbsolute(id)) {
      const file = id.split('?')[0]!;
      files.add(file);
      // 仍转换以完成 Dev 预打包调度，但预打包输出不属于需要冻结的应用源码。
      if (!id.startsWith(normalizePath(server.config.cacheDir) + '/'))
        await trackFile?.(file);
    }
    const result = await environment.transformRequest(url);
    if (!result)
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 无法转换扫描模块：${url}`,
          `[ai-i18n] Cannot transform scan module: ${url}`,
        ),
      );
    // 检查转换后的 import，允许 Vite 将 glob/变量路由展开后再遍历。
    const module = analyzeModule(result.code, `${id}.js`);
    module.walk({
      ImportExpression(expression) {
        if (
          expression.source.type !== 'Literal' ||
          typeof expression.source.value !== 'string'
        ) {
          throw new Error(
            diagnosticMessage(
              `[ai-i18n] 扫描无法确定动态 import 的目标：${url}。请使用静态 import 或可展开的 import.meta.glob。清单未提交。`,
              `[ai-i18n] Scan cannot determine a dynamic import target in ${url}. Use static imports or resolvable import.meta.glob. Catalog was not committed.`,
            ),
          );
        }
      },
    });
    for (const imported of node.importedModules) queue.push(imported.url);
  }
  return files;
}

function validateInlineScripts(
  node: DefaultTreeAdapterTypes.Node,
  file: string,
): void {
  if (
    'tagName' in node &&
    node.tagName === 'script' &&
    !node.attrs.some((attr) => attr.name === 'src') &&
    node.attrs.some((attr) => attr.name === 'type' && attr.value === 'module')
  ) {
    const code = node.childNodes
      .filter((child) => child.nodeName === '#text')
      .map((child) => (child as DefaultTreeAdapterTypes.TextNode).value)
      .join('');
    const module = analyzeModule(code, `${file}.js`);
    if (
      findRuntimeImportDeclarations(module).length ||
      findUnboundReferences(
        module,
        new Set(['t', 'tRef', 'tComputed', 'useI18n', 'defineI18nMessages']),
      ).length
    ) {
      throw new Error(
        diagnosticMessage(
          `[ai-i18n] 内联 HTML 脚本的翻译调用暂不参与源码提取，请移到独立 JS/TS 模块：${file}。清单未提交。`,
          `[ai-i18n] Inline HTML script translation calls are not extracted. Move ai-i18n calls to a separate JS/TS module: ${file}. Catalog was not committed.`,
        ),
      );
    }
  }
  if ('childNodes' in node)
    node.childNodes.forEach((child) => validateInlineScripts(child, file));
}
