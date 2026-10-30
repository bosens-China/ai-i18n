import type {
  ResolvedConfig,
  NormalizedHotChannel,
  NormalizedHotChannelClient,
} from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { FileStore } from './file-store.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { ProjectState } from './project-state.js';
import type { RemoteAdapter, RemoteContext } from './remote.js';
import { remoteCatalog, remoteContext } from './remote-context.js';
import { validateRemoteSnapshot } from './remote-validation.js';
import type { TranslationMeta } from './runtime.js';
import { createRemoteBuildValues } from './remote-build.js';
import { REMOTE_READY_EVENT, sendRemoteUpdate } from './remote-updates.js';

export { REMOTE_UPDATE_EVENT } from './remote-updates.js';

interface RemoteDependencies {
  adapter: RemoteAdapter;
  config(): ResolvedConfig | undefined;
  state(): ProjectState;
  store(): FileStore;
  runStateTask: DevStateTaskRunner;
  flushPersistence(): Promise<void>;
  notify(
    affected: readonly string[],
    publicMeta: TranslationMeta | undefined,
  ): void;
}

export function createPluginRemote(options: RemoteDependencies) {
  let publicMeta: TranslationMeta | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let controller: AbortController | undefined;
  let appliedKey: string | undefined;
  let closed = false;
  let requested = false;
  let disconnect: (() => void) | undefined;
  const catalog = () => remoteCatalog(options.state());
  const report = (error: unknown, stage: 'publish' | 'load') => {
    const message = diagnosticMessage(
      `[ai-i18n] remote.${stage} 失败：${error instanceof Error ? error.message : String(error)}`,
      `[ai-i18n] remote.${stage} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    if (stage === 'publish') options.config()?.logger.warn(message);
    else options.config()?.logger.error(message);
  };
  async function call<T>(
    messages: RemoteContext['messages'],
    action: (context: RemoteContext) => Promise<T>,
  ): Promise<T> {
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(
      () =>
        controller?.abort(
          new Error(
            diagnosticMessage(
              '远程操作超过 30 秒。',
              'Remote operation exceeded 30 seconds.',
            ),
          ),
        ),
      30_000,
    );
    let onAbort: () => void;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const context = remoteContext(
        options.state(),
        options.config()!.command,
        messages,
        signal,
      );
      return await Promise.race([
        Promise.resolve().then(() => action(context)),
        aborted,
      ]);
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort!);
      controller = undefined;
    }
  }
  async function sync(force = false) {
    const messages = await options.runStateTask(catalog);
    const key = JSON.stringify(messages);
    if (closed || (!force && key === appliedKey)) return;
    appliedKey = key;
    if (options.adapter.publish) {
      try {
        await call(messages, (context) => options.adapter.publish!(context));
      } catch (error) {
        if (!closed) report(error, 'publish');
      }
    }
    if (closed || !options.adapter.load) return;
    const snapshot = await call(messages, async (context) =>
      validateRemoteSnapshot(await options.adapter.load!(context), context),
    );
    if (closed) return;
    await options.runStateTask(async () => {
      // 请求期间源码已变化时丢弃旧结果，下一批使用新清单重新获取。
      if (closed || JSON.stringify(catalog()) !== key) return;
      await options.flushPersistence();
      const project = options.state();
      const affected =
        options.adapter.mode === 'overlay'
          ? project.hydrateRemoteOverlay(snapshot.cache)
          : project.hydrateCache(snapshot.cache);
      publicMeta = snapshot.publicMeta;
      const persisted = await options.store().sync(project.snapshot());
      affected.push(...project.hydrateCache(persisted));
      affected.push(
        ...project.hydrateOverrides(await options.store().loadOverrides()),
      );
      if (options.config()?.command === 'serve')
        options.notify(affected, publicMeta);
    });
  }
  function schedule() {
    if (closed) return;
    requested = true;
    if (active || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      requested = false;
      active = sync()
        .catch((error) => {
          if (!closed) report(error, 'load');
        })
        .finally(() => {
          active = undefined;
          if (requested) schedule();
        });
    }, 100);
  }
  return {
    buildValues: options.adapter.load
      ? createRemoteBuildValues(options.state, () => publicMeta)
      : undefined,
    meta: () => publicMeta,
    connect(hot: NormalizedHotChannel) {
      disconnect?.();
      const onReady = (_data: unknown, client: NormalizedHotChannelClient) => {
        void options
          .runStateTask(() => {
            if (closed || !options.adapter.load) return;
            const project = options.state();
            sendRemoteUpdate(
              project,
              [...project.modules.keys()],
              publicMeta,
              undefined,
              client,
            );
          })
          .catch((error) => {
            if (!closed) report(error, 'load');
          });
      };
      hot.on(REMOTE_READY_EVENT, onReady);
      disconnect = () => hot.off(REMOTE_READY_EVENT, onReady);
    },
    schedule,
    async settle() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      requested = false;
      await active;
      if (timer) clearTimeout(timer);
      timer = undefined;
      requested = false;
    },
    async build() {
      try {
        await sync(true);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          diagnosticMessage(
            `[ai-i18n] remote.load 失败：${reason}`,
            `[ai-i18n] remote.load failed: ${reason}`,
          ),
          { cause },
        );
      }
    },
    async close() {
      closed = true;
      disconnect?.();
      if (timer) clearTimeout(timer);
      controller?.abort(new Error('Closed'));
      await active;
    },
  };
}
