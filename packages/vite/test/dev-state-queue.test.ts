import { describe, expect, it } from 'vitest';
import { createDevStateQueue } from '../src/dev-state-queue';

describe('Dev state queue', () => {
  it('keeps asynchronous state transactions in call order', async () => {
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const events: string[] = [];
    const run = createDevStateQueue();

    const first = run(async () => {
      events.push('first:start');
      await firstBlocked;
      events.push('first:end');
    });
    const second = run(() => {
      events.push('second');
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues after a failed transaction', async () => {
    const run = createDevStateQueue();

    await expect(
      run(async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(run(() => 'recovered')).resolves.toBe('recovered');
  });
});
