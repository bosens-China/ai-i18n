import path from 'node:path';
import fs from 'node:fs/promises';
import { expect, it, vi } from 'vitest';
import type { ReviewSnapshot } from '@ai-i18n/core';
import {
  fixtureRoot,
  start,
  startListening,
  write,
} from './review-server-test-utils';
import { aiI18nPluginApi } from '../src/plugin-api';
import { ensureScan } from '../src/scan-catalog';
import { scanWithDev } from '../src/scan-bridge';
import {
  readTestTranslationMemory,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

const text = (source: string) =>
  `import { t } from 'virtual:ai-i18n'; console.log(t('${source}'));`;

it('hands the scan bridge to a restarted Dev server', async () => {
  const root = await fixtureRoot();
  await write(
    root,
    'index.html',
    '<script type="module" src="/main.ts"></script>',
  );
  await write(root, 'main.ts', text('保存'));
  const { vite } = await startListening(root);
  const previousConfig = vite.config;

  await vite.restart();

  expect(vite.config).not.toBe(previousConfig);
  expect((await scanWithDev(vite))?.message_count).toBe(1);
});
it('refreshes unvisited routes, removes old references, rejects stale saves and recovers after errors', async () => {
  const root = await fixtureRoot();
  await write(
    root,
    'index.html',
    '<script type="module" src="/main.ts"></script>',
  );
  await write(
    root,
    'main.ts',
    "console.log(import.meta.glob('./pages/*.ts'));",
  );
  await write(root, 'pages/lazy.ts', text('保存'));
  // 模拟已运行过扫描/Build 的应用：历史译文不能让已移除的文案继续通过保存校验。
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    memory.messages['保存'] = {
      source: '保存',
      sourceLang: 'zh-CN',
      translations: { 'en-US': 'Save' },
    };
  });
  const { origin, vite } = await start(root);
  const api = vite.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
  const snapshot = async () => {
    const response = await fetch(`${origin}/__ai-i18n/api/messages?scope=all`);
    expect(response.status).toBe(200);
    return response.json() as Promise<ReviewSnapshot>;
  };
  expect(
    (await snapshot()).messages.map((item) => item.message.source),
  ).toEqual(['保存']);
  await write(root, 'pages/lazy.ts', text('提交'));
  expect(
    (await snapshot()).messages.map((item) => item.message.source),
  ).toEqual(['提交']);
  const save = await fetch(`${origin}/__ai-i18n/api/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      message: { source: '保存' },
      locale: 'en-US',
      value: 'Save',
    }),
  });
  expect(save.status).toBe(404);
  await write(root, 'pages/added.ts', text('新增'));
  expect((await snapshot()).messages).toHaveLength(2);
  // 单独验证扫描回滚，避免源码 HMR 先把待恢复状态更新成这份故意损坏的输入。
  await vite.watcher.unwatch(path.join(root, 'pages/lazy.ts'));
  await write(root, 'pages/lazy.ts', 'export const broken = ;');
  await expect(ensureScan(vite, api)).rejects.toThrow();
  expect(api.state().snapshot().cache.messages['提交']).toBeDefined();
  await write(root, 'pages/lazy.ts', 'export {};');
  vite.watcher.add(path.join(root, 'pages/lazy.ts'));
  await fs.rename(
    path.join(root, 'pages/added.ts'),
    path.join(root, 'pages/renamed.ts'),
  );
  const latest = await snapshot();
  expect(latest.messages).toHaveLength(1);
  expect(latest.messages[0].occurrences[0].sourceFile).toBe('pages/renamed.ts');
  expect(
    (await readTestTranslationMemory(path.join(root, 'i18n'))).messages['保存'],
  ).toBeDefined();
  expect((await scanWithDev(vite))?.message_count).toBe(1);
});

it('reuses extraction but reads new translations, and invalidates a changed catalog', async () => {
  const root = await fixtureRoot();
  await write(
    root,
    'index.html',
    '<script type="module" src="/main.ts"></script>',
  );
  await write(root, 'main.ts', text('保存'));
  // 测试 runtime 放在 node_modules，和已发布包一样不属于应用扫描输入。
  await write(
    root,
    'node_modules/test-runtime/index.js',
    'export const t = (value) => value;',
  );
  const { vite } = await start(
    root,
    undefined,
    {},
    path.join(root, 'node_modules/test-runtime/index.js'),
  );
  const api = vite.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
  expect((await ensureScan(vite, api)).reused).toBe(false);
  // 后续手动扫描磁盘变化，关闭文件监听以免异步 HMR 抢先重建提取清单。
  await vite.watcher.close();
  const transform = vi.spyOn(vite.environments.client!, 'transformRequest');
  expect((await ensureScan(vite, api)).reused).toBe(true);
  expect(transform).not.toHaveBeenCalled();
  await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
    memory.messages['保存']!.translations['en-US'] = 'Save';
  });
  expect((await ensureScan(vite, api)).locales[0]).toMatchObject({
    translated: 1,
    missing: 0,
  });
  expect(transform).not.toHaveBeenCalled();
  await fs.rm(path.join(root, 'i18n/extracted'), { recursive: true });
  expect((await ensureScan(vite, api)).reused).toBe(false);
  await fs.rm(vite.config.cacheDir, { recursive: true, force: true });
  expect((await scanWithDev(vite))?.message_count).toBe(1);
});

it('rejects a scan changed in flight and a moved occurrence before watcher delivery', async () => {
  const root = await fixtureRoot();
  await write(
    root,
    'index.html',
    '<script type="module" src="/main.ts"></script>',
  );
  await write(root, 'main.ts', text('保存'));
  const { vite, origin } = await start(root);
  await vite.transformRequest('/main.ts');
  const snapshot = (await fetch(`${origin}/__ai-i18n/api/messages`).then(
    (response) => response.json(),
  )) as ReviewSnapshot;
  const occurrence = snapshot.messages[0]!.occurrences[0]!;
  await write(root, 'main.ts', '\n' + text('保存'));
  const response = await fetch(`${origin}/__ai-i18n/api/overrides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      message: { source: '保存' },
      locale: 'en-US',
      file: occurrence.sourceFile,
      location: occurrence.locations[0],
      value: 'Save',
    }),
  });
  expect(response.status).toBe(400);
  expect((await response.json()).error.code).toBe('UNKNOWN_SOURCE_LOCATION');
  const api = vite.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
  const transform = vite.environments.client!.transformRequest.bind(
    vite.environments.client,
  );
  let changed = false;
  vi.spyOn(vite.environments.client!, 'transformRequest').mockImplementation(
    async (...args) => {
      const result = await transform(...args);
      if (api.scanning && !changed && args[0].split('?')[0] === '/main.ts') {
        changed = true;
        await write(root, 'main.ts', text('提交'));
      }
      return result;
    },
  );
  // 模拟预转换先于正式扫描发生，不能提前消费扫描中途修改的注入。
  await vite.environments.client!.transformRequest('/main.ts');
  expect(changed).toBe(false);
  // 强制覆盖已收到 HMR 的情况：Vite 会给 HTML 入口附加 ?t= 时间戳。
  vite.environments.client!.moduleGraph.getModuleById(
    path.join(root, 'main.ts'),
  )!.lastHMRTimestamp = Date.now();
  await expect(ensureScan(vite, api)).rejects.toThrow(
    'Source changed during scanning',
  );
  expect(changed).toBe(true);
  expect((await ensureScan(vite, api)).message_count).toBe(1);
  expect(api.state().snapshot().cache.messages['提交']).toBeDefined();
});

it('keeps Provider translation available when a scanned page is later visited', async () => {
  const root = await fixtureRoot();
  await write(
    root,
    'index.html',
    '<script type="module" src="/main.ts"></script>',
  );
  await write(root, 'main.ts', text('保存'));
  const translator = vi.fn(async () => []);
  const { vite } = await start(root, {
    sourceLang: 'zh-CN',
    locales: [
      { value: 'zh-CN', label: '中文' },
      { value: 'en-US', label: 'English' },
    ],
    loading: {},
    provider: { translator },
  });
  const api = vite.config.plugins.map(aiI18nPluginApi).find(Boolean)!;
  await ensureScan(vite, api);
  expect(translator).not.toHaveBeenCalled();
  const visited = await vite.transformRequest('/main.ts');
  expect(visited?.code).toContain('__registerModule');
  expect(visited?.code).toContain('__aiI18nAt');
  await vi.waitFor(() => expect(translator).toHaveBeenCalledOnce());
});
