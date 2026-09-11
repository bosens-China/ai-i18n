import type { PerformanceRecorder } from './performance-recorder.js';

export type DevStateTaskRunner = <T>(
  task: () => T | PromiseLike<T>,
) => Promise<T>;

export function createDevStateQueue(
  performance?: PerformanceRecorder,
): DevStateTaskRunner {
  let tail: Promise<void> = Promise.resolve();

  return function run<T>(task: () => T | PromiseLike<T>): Promise<T> {
    const moduleId = performance?.currentModule() ?? '<project>';
    const waiting = performance?.start('state-queue-wait', moduleId);
    const execute = () => {
      waiting?.end();
      return performance
        ? performance.measure('state-execute', moduleId, task)
        : task();
    };
    const result = tail.then(execute, execute);
    // 单个状态事务失败后仍要释放队列，避免后续 Dev 更新永久阻塞。
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
