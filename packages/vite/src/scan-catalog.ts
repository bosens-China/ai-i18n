import fs from 'node:fs/promises';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { withFileQueue } from '@ai-i18n/core/translation-memory';
import { ProjectState } from './project-state.js';
import type { AiI18nPluginApi } from './plugin-api.js';
import { scanEntries, walkScanGraph } from './scan-graph.js';
import {
  canReuseScan,
  digest,
  scanCandidates,
  scanFile,
  scanInputs,
} from './scan-cache.js';
import { buildFileGroups } from './file-groups.js';
import { summarizeRepository } from './repository-coverage.js';

export type ScanResult = Awaited<ReturnType<typeof scanCatalog>>;

/** 三个入口共享这一个扫描事务；活动 Dev 的调用在此合并。 */
export function ensureScan(
  server: ViteDevServer,
  api: AiI18nPluginApi,
  entries?: readonly string[],
): Promise<ScanResult> {
  if (api.scanPending) return api.scanPending;
  const pending = withFileQueue(
    path.join(api.store().directory, '.scan'),
    async () => {
      try {
        return await scanCatalog(server, api, entries);
      } catch (cause) {
        await fs
          .rm(path.join(server.config.cacheDir, 'ai-i18n-scan.json'), {
            force: true,
          })
          .catch(() => undefined);
        throw cause;
      }
    },
  );
  api.scanPending = pending;
  void pending
    .finally(() => {
      if (api.scanPending === pending) api.scanPending = undefined;
    })
    .catch(() => undefined);
  return pending;
}

async function scanCatalog(
  server: ViteDevServer,
  api: AiI18nPluginApi,
  entries?: readonly string[],
) {
  await api.ready();
  await api.flushProvider();
  await api.runStateTask(api.flushPersistence);
  const store = api.store();
  const entryFiles = await Promise.all(
    scanEntries(server.config, entries).map((file) => fs.realpath(file)),
  );
  const filename = path.join(server.config.cacheDir, 'ai-i18n-scan.json');
  const before = await scanInputs(server, api);
  const key = digest(JSON.stringify([before.hash, entryFiles]));
  const extracted = await store.loadExtracted();
  const output = () =>
    digest(
      JSON.stringify(
        [...extracted].sort((a, b) => a.source.localeCompare(b.source)),
      ),
    );
  const cached = await fs
    .readFile(filename, 'utf8')
    .then((text) => JSON.parse(text) as { key: string; output: string })
    .catch(() => undefined);
  let reused =
    before.complete &&
    canReuseScan(server) &&
    cached?.key === key &&
    cached.output === output();
  if (store.repository) reused = false;
  let repositorySummary: ReturnType<typeof summarizeRepository> | undefined;
  // 活动 Dev 首次必须建自己的模块图，不能只把磁盘结果塞进缺少依赖关系的 Analyzer。
  if (!api.scanMode && !api.scanned) reused = false;
  if (!reused) {
    await fs.rm(filename, { force: true });
    const previous = api.state();
    api.scanning = true;
    try {
      await api.settleTransforms();
      await api.flushProvider();
      await api.runStateTask(api.flushPersistence);
      await api.settleTransforms(() =>
        api.replaceState(
          new ProjectState(server.config.root, api.options, api.scanMode),
        ),
      );
      api.state().hydrateCache(await store.load());
      api.state().hydrateOverrides(await store.loadOverrides());
      server.environments.client!.moduleGraph.invalidateAll();
      const consumed = new Map<string, string | undefined>();
      const trackFile = async (file: string) => {
        file = path.resolve(file);
        if (!consumed.has(file))
          consumed.set(file, before.files.get(file) ?? (await scanFile(file)));
      };
      for (const file of server.config.configFileDependencies)
        await trackFile(file);
      const ids = await walkScanGraph(server, entryFiles, trackFile);
      if (api.state().deferAnalysis) {
        await api.settleTransforms();
        await api.runStateTask(() => api.state().finishAnalysis());
      }
      const active = new Set([...ids].map((id) => api.state().normalizeId(id)));
      const warnings = [...api.state().modules]
        .filter(([id]) => active.has(id))
        .flatMap(([, result]) => result.warnings);
      if (warnings.length)
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] 扫描存在 ${warnings.length} 条提取诊断，未提交清单。\n${warnings.map((item) => `${item.file}:${item.line}:${item.column} ${item.message}`).join('\n')}`,
            `[ai-i18n] Scan has ${warnings.length} extraction diagnostics; catalog was not committed.\n${warnings.map((item) => `${item.file}:${item.line}:${item.column} ${item.message}`).join('\n')}`,
          ),
        );
      const after = await scanInputs(server, api);
      // 内容变化只校验消费输入；候选集合增删仍保守阻止提交，避免漏掉 glob 新页面。
      const changed = await Promise.all(
        [...consumed].map(
          async ([file, value]) => value !== (await scanFile(file)),
        ),
      );
      if (
        before.context !== after.context ||
        scanCandidates(before.files) !== scanCandidates(after.files) ||
        changed.some(Boolean)
      )
        throw new Error(
          diagnosticMessage(
            '[ai-i18n] 扫描期间源码发生变化，请重试；清单未提交。',
            '[ai-i18n] Source changed during scanning. Retry; catalog was not committed.',
          ),
        );
      await api.runStateTask(async () => {
        api.state().retain(ids);
        if (store.repository) {
          const files = Object.values(api.state().snapshot().extracted);
          const prepared = await store.repository.prepare(
            files,
            api.options.sourceLang,
            api.options.locales.map((locale) => locale.value),
            api.adapter,
          );
          await store.repository.commit(
            prepared,
            buildFileGroups(server.config.root, files, {}),
            false,
          );
          repositorySummary = summarizeRepository(server.config.root, prepared);
        }
        api.state().hydrateCache(
          await store.sync(api.state().snapshot(), {
            complete: true,
          }),
        );
      });
      extracted.splice(0, extracted.length, ...(await store.loadExtracted()));
      // 不完整摘要、忽略目录中的消费输入和扫描期间的任何变化都不能成为缓存命中。
      const covered = [...consumed].every(
        ([file, value]) => value === undefined || before.files.has(file),
      );
      if (
        before.complete &&
        after.complete &&
        covered &&
        before.hash === after.hash &&
        canReuseScan(server)
      ) {
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, JSON.stringify({ key, output: output() }));
      }
      // 转换只用于提取；真实页面请求仍走 Dev 的运行时路径。
      server.environments.client!.moduleGraph.invalidateAll();
      api.scanned = true;
      // 运行时会缓存文件包与 manifest；完整刷新才能读取本轮扫描的新分组。
      if (!api.scanMode)
        server.environments.client?.hot.send({ type: 'full-reload' });
    } catch (cause) {
      await api.settleTransforms(() => api.replaceState(previous));
      server.environments.client!.moduleGraph.invalidateAll();
      throw cause;
    } finally {
      api.scanning = false;
    }
  }
  if (!repositorySummary)
    throw new Error(
      diagnosticMessage(
        '[ai-i18n] 扫描未生成仓库资源摘要。',
        '[ai-i18n] Scan did not produce a repository resource summary.',
      ),
    );
  await store.repository?.cleanupLegacy();
  return {
    root: server.config.root,
    i18n_directory: store.directory,
    mode: server.config.mode,
    entries: entryFiles.map((file) =>
      path.relative(server.config.root, file).replaceAll('\\', '/'),
    ),
    reused,
    ...repositorySummary,
  };
}
