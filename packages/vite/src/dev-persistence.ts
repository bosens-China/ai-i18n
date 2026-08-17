import type { ProjectSnapshot } from './project-snapshot.js';
import type { DevTimingReporter } from './dev-timing.js';

interface PersistenceJob {
  snapshot: ProjectSnapshot;
  moduleId: string;
}

interface DevPersistenceOptions {
  sync(snapshot: ProjectSnapshot): Promise<unknown>;
  timing: DevTimingReporter;
  onError(cause: unknown): void;
}

export interface DevPersistenceScheduler {
  schedule(snapshot: ProjectSnapshot, moduleId: string): void;
  flush(): Promise<void>;
}

export function createDevPersistenceScheduler(
  options: DevPersistenceOptions,
): DevPersistenceScheduler {
  let pending: PersistenceJob | undefined;
  let running: Promise<void> | undefined;
  let failure: unknown;

  async function drain(): Promise<void> {
    while (pending) {
      const job = pending;
      pending = undefined;
      try {
        await options.timing.measure('file-sync', job.moduleId, () =>
          options.sync(job.snapshot),
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

  function start(): void {
    if (running || !pending) return;
    running = drain().finally(() => {
      running = undefined;
      start();
    });
    void running.catch(() => undefined);
  }

  return {
    schedule(snapshot, moduleId) {
      // 冷启动突发转换只需要落盘最新状态，中间快照没有外部可见价值。
      pending = { snapshot, moduleId };
      start();
    },
    async flush() {
      start();
      while (running) await running;
      if (failure !== undefined) {
        const cause = failure;
        failure = undefined;
        throw cause;
      }
    },
  };
}
