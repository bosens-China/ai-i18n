export type DevStateTaskRunner = <T>(
  task: () => T | PromiseLike<T>,
) => Promise<T>;

export function createDevStateQueue(): DevStateTaskRunner {
  let tail: Promise<void> = Promise.resolve();

  return function run<T>(task: () => T | PromiseLike<T>): Promise<T> {
    const result = tail.then(task, task);
    // 单个状态事务失败后仍要释放队列，避免后续 Dev 更新永久阻塞。
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
}
