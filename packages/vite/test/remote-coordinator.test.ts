import { afterEach, expect, it, vi } from 'vitest';
import type { ResolvedConfig, NormalizedHotChannel } from 'vite';
import { createPluginRemote } from '../src/plugin-remote';
import { ProjectState } from '../src/project-state';
import type { FileStore } from '../src/file-store';
import type { RemoteAdapter, RemoteContext } from '../src/remote';
import { options } from './plugin-test-utils';

afterEach(() => vi.useRealTimers());

it('replays the applied snapshot to a ready client without requesting the backend again', async () => {
  const load = vi.fn<NonNullable<RemoteAdapter['load']>>(
    async ({ messages }) => ({
      translations: messages.map((message) => ({
        message,
        locale: 'en-US',
        value: 'Ready',
      })),
      publicMeta: { version: 'ready' },
    }),
  );
  const { remote } = fixture({ load });
  await remote.build();
  const on = vi.fn();
  const off = vi.fn();
  remote.connect({ on, off } as unknown as NormalizedHotChannel);
  const send = vi.fn();
  const [event, handler] = on.mock.calls[0]!;
  handler({}, { send });
  await Promise.resolve();
  expect(send).toHaveBeenCalledWith(
    'ai-i18n:remote-update',
    expect.objectContaining({ publicMeta: { version: 'ready' } }),
  );
  expect(load).toHaveBeenCalledOnce();
  await remote.close();
  expect(off).toHaveBeenCalledWith(event, handler);
});

function fixture(adapter: RemoteAdapter) {
  const project = new ProjectState('/workspace', options);
  project.update(
    `import { t } from 'virtual:ai-i18n'; t('原文')`,
    '/workspace/src/main.ts',
  );
  const notify = vi.fn();
  const error = vi.fn();
  const remote = createPluginRemote({
    adapter,
    state: () => project,
    config: () =>
      ({
        command: 'serve',
        logger: { warn: vi.fn(), error },
      }) as unknown as ResolvedConfig,
    store: () =>
      ({
        sync: async () => project.snapshot().cache,
        loadOverrides: async () => ({ version: 2, rules: [] }),
      }) as unknown as FileStore,
    runStateTask: async (task) => task(),
    flushPersistence: async () => {},
    notify,
  });
  return { project, remote, notify, error };
}

it('aborts and fails a build even when an adapter ignores the signal', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  const { remote } = fixture({
    load: async (context) => {
      signal = context.signal;
      return new Promise(() => {});
    },
  });
  const failed = expect(remote.build()).rejects.toThrow(/30 seconds/);
  await vi.advanceTimersByTimeAsync(30_001);
  await failed;
  expect(signal?.aborted).toBe(true);
  await remote.close();
});

it('drops stale Dev results and applies a complete replacement with its metadata', async () => {
  vi.useFakeTimers();
  let release!: (value: {
    translations: [];
    publicMeta: { version: string };
  }) => void;
  let first = true;
  const load = vi.fn(async ({ messages }: RemoteContext) => {
    if (first) {
      first = false;
      return new Promise<{ translations: []; publicMeta: { version: string } }>(
        (resolve) => {
          release = resolve;
        },
      );
    }
    return {
      translations: messages.map((message) => ({
        message,
        locale: 'en-US',
        value: 'New',
      })),
      publicMeta: { version: 'new' },
    };
  });
  const { project, remote, notify } = fixture({ load });
  remote.schedule();
  await vi.advanceTimersByTimeAsync(100);
  project.update(
    `import { t } from 'virtual:ai-i18n'; t('新增')`,
    '/workspace/src/main.ts',
  );
  remote.schedule();
  release({ translations: [], publicMeta: { version: 'stale' } });
  await vi.advanceTimersByTimeAsync(100);
  expect(load).toHaveBeenCalledTimes(2);
  expect(remote.meta()).toEqual({ version: 'new' });
  expect(notify).toHaveBeenCalledTimes(1);
  expect(project.snapshot().cache.messages['新增']?.translations['en-US']).toBe(
    'New',
  );
  await remote.close();
});

it('keeps the applied snapshot intact when the next full snapshot is invalid', async () => {
  const load = vi.fn<NonNullable<RemoteAdapter['load']>>(
    async ({ messages }) => ({
      translations: messages.map((message) => ({
        message,
        locale: 'en-US',
        value: 'Valid',
      })),
      publicMeta: { version: 'valid' },
    }),
  );
  const { project, remote } = fixture({ load });
  await remote.build();
  load.mockResolvedValueOnce({
    translations: [
      { message: { source: 'unknown' }, locale: 'en-US', value: 'Bad' },
    ],
    publicMeta: { version: 'invalid' },
  });
  await expect(remote.build()).rejects.toThrow();
  expect(remote.meta()).toEqual({ version: 'valid' });
  expect(project.snapshot().cache.messages['原文']?.translations['en-US']).toBe(
    'Valid',
  );
  load.mockResolvedValueOnce({ translations: [] });
  await remote.build();
  expect(remote.meta()).toBeUndefined();
  expect(
    project.snapshot().cache.messages['原文']?.translations['en-US'],
  ).toBeNull();
  await remote.close();
});

it('retains the last overlay on failure and restores the local base after a successful withdrawal', async () => {
  const load = vi.fn<NonNullable<RemoteAdapter['load']>>(async () => ({
    translations: [
      { message: { source: '原文' }, locale: 'en-US', value: 'Priority' },
    ],
    publicMeta: { version: 'priority' },
  }));
  const { project, remote } = fixture({ mode: 'overlay', load });
  const cache = project.snapshot().cache;
  cache.messages['原文']!.translations['en-US'] = 'Local base';
  project.hydrateCache(cache);
  await remote.build();
  expect(JSON.stringify(project.registration('src/main.ts'))).toContain(
    'Priority',
  );
  expect(project.snapshot().cache).toEqual(cache);
  load.mockRejectedValueOnce(new Error('offline'));
  await expect(remote.build()).rejects.toThrow('offline');
  expect(remote.meta()).toEqual({ version: 'priority' });
  expect(JSON.stringify(project.registration('src/main.ts'))).toContain(
    'Priority',
  );
  load.mockResolvedValueOnce({ translations: [] });
  await remote.build();
  expect(JSON.stringify(project.registration('src/main.ts'))).toContain(
    'Local base',
  );
  await remote.close();
});
