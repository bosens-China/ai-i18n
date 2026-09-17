import fs from 'node:fs/promises';
import path from 'node:path';
import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { withFileLock } from '@ai-i18n/core/translation-memory';
import { ProjectState } from './project-state.js';
import type { AiI18nPluginApi } from './plugin-api.js';
import { scanEntries, walkScanGraph } from './scan-graph.js';
import { summarizeProject } from './build-summary.js';
import { canReuseScan, digest, scanInputs } from './scan-cache.js';

export type ScanResult = Awaited<ReturnType<typeof scanCatalog>>;

/** 三个入口共享这一个扫描事务；活动 Dev 的调用在此合并。 */
export function ensureScan(
  server: ViteDevServer,
  api: AiI18nPluginApi,
  entries?: readonly string[],
): Promise<ScanResult> {
  if (api.scanPending) return api.scanPending;
  const pending = withFileLock(
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
    canReuseScan(server) && cached?.key === key && cached.output === output();
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
        api.replaceState(new ProjectState(server.config.root, api.options)),
      );
      api.state().hydrateCache(await store.load());
      api.state().hydrateOverrides(await store.loadOverrides());
      server.environments.client!.moduleGraph.invalidateAll();
      const ids = await walkScanGraph(server, entryFiles);
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
      if (before.hash !== after.hash)
        throw new Error(
          diagnosticMessage(
            '[ai-i18n] 扫描期间源码发生变化，请重试；清单未提交。',
            '[ai-i18n] Source changed during scanning. Retry; catalog was not committed.',
          ),
        );
      await api.runStateTask(async () => {
        api.state().retain(ids);
        api.state().hydrateCache(
          await store.sync(api.state().snapshot(), {
            complete: true,
            preserveHistory: true,
          }),
        );
      });
      extracted.splice(0, extracted.length, ...(await store.loadExtracted()));
      // root 外的消费源码无法由本次摘要覆盖，不写可命中的记录。
      const covered = [...ids].every(
        (id) => !path.isAbsolute(id) || id.startsWith(before.root + path.sep),
      );
      if (covered) {
        await fs.mkdir(path.dirname(filename), { recursive: true });
        await fs.writeFile(filename, JSON.stringify({ key, output: output() }));
      }
      // 转换只用于提取；真实页面请求仍需走 Dev 的注册和 Provider 流程。
      server.environments.client!.moduleGraph.invalidateAll();
      api.scanned = true;
      for (const locale of api.options.locales)
        api.notify(
          [
            ...new Set([
              ...previous.modules.keys(),
              ...api.state().modules.keys(),
            ]),
          ],
          locale.value,
        );
    } catch (cause) {
      await api.settleTransforms(() => api.replaceState(previous));
      server.environments.client!.moduleGraph.invalidateAll();
      throw cause;
    } finally {
      api.scanning = false;
    }
  }
  const state = new ProjectState(server.config.root, api.options);
  for (const file of extracted)
    state.updateExtracted(
      '',
      path.resolve(server.config.root, file.source),
      file.messages,
    );
  state.hydrateCache(await store.load());
  state.hydrateOverrides(await store.loadOverrides());
  return {
    root: server.config.root,
    i18n_directory: store.directory,
    mode: server.config.mode,
    entries: entryFiles.map((file) =>
      path.relative(server.config.root, file).replaceAll('\\', '/'),
    ),
    reused,
    ...summarizeProject(state),
  };
}
