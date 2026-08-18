import type { ProjectSnapshot } from './project-snapshot.js';
import type { DevTimingReporter } from './dev-timing.js';

interface PersistenceJobContext {
  moduleId: string;
  changedSources: readonly string[];
}

interface DevPersistenceOptions {
  snapshot(): ProjectSnapshot;
  sync(
    snapshot: ProjectSnapshot,
    context: PersistenceJobContext,
  ): Promise<unknown>;
  timing: DevTimingReporter;
  onError(cause: unknown): void;
  debounceMs?: number;
  maxWaitMs?: number;
}

export interface DevPersistenceScheduler {
  schedule(moduleId: string): void;
  flush(): Promise<void>;
}

const DEFAULT_DEBOUNCE_MS = 50;
const DEFAULT_MAX_WAIT_MS = 500;

export function createDevPersistenceScheduler(
  options: DevPersistenceOptions,
): DevPersistenceScheduler {
  const dirtySources = new Set<string>();
  let latestModuleId = '<unknown>';
  let running: Promise<void> | undefined;
  let failure: unknown;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;

  async function drain(): Promise<void> {
    while (dirtySources.size) {
      const context: PersistenceJobContext = {
        moduleId: latestModuleId,
        changedSources: [...dirtySources].sort(),
      };
      dirtySources.clear();
      try {
        const snapshot = await options.timing.measure(
          'snapshot-build',
          context.moduleId,
          options.snapshot,
        );
        await options.timing.measure('file-sync', context.moduleId, () =>
          options.sync(snapshot, context),
        );
      } catch (cause) {
        failure = cause;
        try {
          options.onError(cause);
        } catch {
          // 诊断接收器不能让后台持久化产生未处理 rejection。
        }
      }
    }
  }

  function clearTimers(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxWaitTimer) clearTimeout(maxWaitTimer);
    debounceTimer = undefined;
    maxWaitTimer = undefined;
  }

  function start(): void {
    if (running || !dirtySources.size) return;
    clearTimers();
    running = drain().finally(() => {
      running = undefined;
      if (dirtySources.size) scheduleStart();
    });
    void running.catch(() => undefined);
  }

  function scheduleStart(): void {
    if (running || !dirtySources.size) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(start, debounceMs);
    if (!maxWaitTimer) maxWaitTimer = setTimeout(start, maxWaitMs);
    debounceTimer.unref?.();
    maxWaitTimer.unref?.();
  }

  return {
    schedule(moduleId) {
      // 冷启动突发转换只记录变化来源，快照在真正写入前统一生成。
      dirtySources.add(moduleId);
      latestModuleId = moduleId;
      scheduleStart();
    },
    async flush() {
      clearTimers();
      start();
      while (running || dirtySources.size) {
        if (!running) start();
        if (running) await running;
      }
      if (failure !== undefined) {
        const cause = failure;
        failure = undefined;
        throw cause;
      }
    },
  };
}
