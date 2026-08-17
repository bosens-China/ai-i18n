import { describe, expect, it, vi } from 'vitest';
import { createDevPersistenceScheduler } from '../src/dev-persistence';
import type { ProjectSnapshot } from '../src/project-snapshot';
import { createDevTimingReporter } from '../src/dev-timing';

function snapshot(id: string): ProjectSnapshot {
  return { id } as unknown as ProjectSnapshot;
}

describe('Dev persistence scheduler', () => {
  it('keeps one writer and coalesces queued work to the latest snapshot', async () => {
    let release!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = vi
      .fn<(value: ProjectSnapshot) => Promise<void>>()
      .mockImplementationOnce(async () => firstWrite)
      .mockResolvedValue(undefined);
    const scheduler = createDevPersistenceScheduler({
      sync,
      timing: createDevTimingReporter(undefined, {
        enabled: () => false,
        log: () => {},
      }),
      onError: vi.fn(),
    });
    const first = snapshot('first');
    const middle = snapshot('middle');
    const latest = snapshot('latest');

    scheduler.schedule(first, 'src/first.ts');
    scheduler.schedule(middle, 'src/middle.ts');
    scheduler.schedule(latest, 'src/latest.ts');
    release();
    await scheduler.flush();

    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenNthCalledWith(1, first);
    expect(sync).toHaveBeenNthCalledWith(2, latest);
  });

  it('reports background failures and surfaces them at the next flush', async () => {
    const failure = new Error('write failed');
    const onError = vi.fn();
    const scheduler = createDevPersistenceScheduler({
      sync: vi.fn(async () => {
        throw failure;
      }),
      timing: createDevTimingReporter(undefined, {
        enabled: () => false,
        log: () => {},
      }),
      onError,
    });

    scheduler.schedule(snapshot('failed'), 'src/failed.ts');

    await expect(scheduler.flush()).rejects.toBe(failure);
    expect(onError).toHaveBeenCalledWith(failure);
    await expect(scheduler.flush()).resolves.toBeUndefined();
  });
});
