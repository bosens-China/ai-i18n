import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevPersistenceScheduler } from '../src/dev-persistence';
import type { ProjectSnapshot } from '../src/project-snapshot';
import { createDevTimingReporter } from '../src/dev-timing';

function snapshot(id: string): ProjectSnapshot {
  return { id } as unknown as ProjectSnapshot;
}

function timing() {
  return createDevTimingReporter(undefined, {
    enabled: () => false,
    log: () => {},
  });
}

describe('Dev persistence scheduler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces dirty sources and creates one snapshot at flush', async () => {
    const latest = snapshot('latest');
    const createSnapshot = vi.fn(() => latest);
    const sync = vi.fn(async () => {});
    const scheduler = createDevPersistenceScheduler({
      snapshot: createSnapshot,
      sync,
      timing: timing(),
      onError: vi.fn(),
    });

    scheduler.schedule('src/first.ts');
    scheduler.schedule('src/middle.ts');
    scheduler.schedule('src/latest.ts');
    await scheduler.flush();

    expect(createSnapshot).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(latest, {
      moduleId: 'src/latest.ts',
      changedSources: ['src/first.ts', 'src/latest.ts', 'src/middle.ts'],
    });
  });

  it('waits for the debounce window but never exceeds max-wait', async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => {});
    const scheduler = createDevPersistenceScheduler({
      snapshot: () => snapshot('timed'),
      sync,
      timing: timing(),
      onError: vi.fn(),
      debounceMs: 50,
      maxWaitMs: 120,
    });

    scheduler.schedule('src/first.ts');
    await vi.advanceTimersByTimeAsync(40);
    scheduler.schedule('src/second.ts');
    await vi.advanceTimersByTimeAsync(40);
    scheduler.schedule('src/third.ts');
    await vi.advanceTimersByTimeAsync(39);
    expect(sync).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('keeps one writer and persists changes received during a write', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(async () => firstWrite)
      .mockResolvedValue(undefined);
    const createSnapshot = vi
      .fn<() => ProjectSnapshot>()
      .mockReturnValueOnce(snapshot('first'))
      .mockReturnValueOnce(snapshot('latest'));
    const scheduler = createDevPersistenceScheduler({
      snapshot: createSnapshot,
      sync,
      timing: timing(),
      onError: vi.fn(),
      debounceMs: 10,
    });

    scheduler.schedule('src/first.ts');
    await vi.advanceTimersByTimeAsync(10);
    scheduler.schedule('src/latest.ts');
    release();
    await scheduler.flush();

    expect(sync).toHaveBeenCalledTimes(2);
    expect(createSnapshot).toHaveBeenCalledTimes(2);
  });

  it('reports background failures and surfaces them at the next flush', async () => {
    const failure = new Error('write failed');
    const onError = vi.fn();
    const scheduler = createDevPersistenceScheduler({
      snapshot: () => snapshot('failed'),
      sync: vi.fn(async () => {
        throw failure;
      }),
      timing: timing(),
      onError,
    });

    scheduler.schedule('src/failed.ts');

    await expect(scheduler.flush()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    await expect(scheduler.flush()).resolves.toBeUndefined();
  });
});
