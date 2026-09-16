import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { fixtureRoot, options, start, write } from './review-server-test-utils';
import {
  translationShardFiles,
  updateTestTranslationMemory,
} from './translation-memory-test-utils';

describe('Dev translation cache consistency', { timeout: 10_000 }, () => {
  it.each([false, true])(
    'serves fresh data after review save and removal (lazy=%s)',
    async (lazy) => {
      const root = await fixtureRoot();
      await write(
        root,
        'src/main.ts',
        "import { t } from 'virtual:ai-i18n'; export const render = () => t('保存');",
      );
      await write(root, 'src/untouched.ts', 'export const untouched = true;');
      const { vite, origin } = await start(root, {
        ...options,
        ...(lazy ? { loading: {} } : {}),
      });
      await vite.transformRequest('/src/main.ts');
      const untouched = await vite.transformRequest('/src/untouched.ts');
      const resource = lazy
        ? '/@id/__x00__virtual:ai-i18n/locale/en-US'
        : '/src/main.ts';
      const initial = await fetch(`${origin}${resource}`);
      const initialCode = await initial.text();
      const initialEtag = initial.headers.get('etag')!;
      const send = vi.spyOn(vite.environments.client!.hot, 'send');
      const snapshot = await fetch(`${origin}/__ai-i18n/api/messages`).then(
        (r) => r.json(),
      );
      const occurrence = snapshot.messages[0].occurrences[0];
      const target = {
        message: { source: '保存' },
        locale: 'en-US',
        file: occurrence.sourceFile,
        location: occurrence.locations[0],
      };
      let previousEtag = initialEtag;

      for (const value of ['Reviewed first', 'Reviewed second', undefined]) {
        send.mockClear();
        const response = await fetch(`${origin}/__ai-i18n/api/overrides`, {
          method: value === undefined ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body: JSON.stringify({ ...target, value }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          changed: true,
          affectedModuleCount: 1,
        });
        const update = send.mock.calls.find(
          ([event]) =>
            event === (lazy ? 'ai-i18n:locale-update' : 'ai-i18n:update'),
        );
        expect(update).toBeDefined();
        expect(JSON.stringify(update)).toContain(value ?? 'null');
        const fresh = await fetch(`${origin}${resource}`, {
          headers: { 'If-None-Match': previousEtag },
        });
        expect(fresh.status).toBe(200);
        const code = await fresh.text();
        if (value) expect(code).toContain(value);
        else expect(code).toBe(initialCode);
        previousEtag = fresh.headers.get('etag')!;
        expect(await vite.transformRequest('/src/untouched.ts')).toBe(
          untouched,
        );
        expect(send).not.toHaveBeenCalledWith(
          expect.objectContaining({ type: 'full-reload' }),
        );
      }
    },
  );

  it.each([false, true])(
    'invalidates cached responses for Provider and external writes (lazy=%s)',
    async (lazy) => {
      const root = await fixtureRoot();
      await write(
        root,
        'src/main.ts',
        "import { t } from 'virtual:ai-i18n'; export const render = () => t('保存');",
      );
      let resolveTranslation!: (values: Array<Record<string, string>>) => void;
      const translated = new Promise<Array<Record<string, string>>>(
        (resolve) => {
          resolveTranslation = resolve;
        },
      );
      const translator = vi.fn(async () => translated);
      const { vite, origin } = await start(root, {
        ...options,
        ...(lazy ? { loading: {} } : {}),
        provider: { translator, debounceMs: 0 },
      });
      await vite.transformRequest('/src/main.ts');
      const resource = lazy
        ? '/@id/__x00__virtual:ai-i18n/locale/en-US'
        : '/src/main.ts';
      await fetch(`${origin}${resource}`).then((r) => r.text());
      resolveTranslation([{ 'en-US': 'Provider value' }]);
      await expect
        .poll(() => fetch(`${origin}${resource}`).then((r) => r.text()))
        .toContain('Provider value');
      expect(translator).toHaveBeenCalledOnce();
      // 等待新建分片进入 watcher，避免把冷启动监听时序当成缓存失效失败。
      const [shard] = await translationShardFiles(root);
      expect(shard).toBeDefined();
      await expect
        .poll(() => vite.watcher.getWatched()[path.dirname(shard!)])
        .toContain(path.basename(shard!));
      await updateTestTranslationMemory(path.join(root, 'i18n'), (memory) => {
        memory.messages['保存']!.translations['en-US'] = 'External value';
      });
      await expect
        .poll(() => fetch(`${origin}${resource}`).then((r) => r.text()), {
          timeout: 5_000,
        })
        .toContain('External value');
      expect(translator).toHaveBeenCalledOnce();
    },
  );
});
