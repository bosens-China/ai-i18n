import { describe, expect, it } from 'vitest';
import { PerformanceRecorder } from '../src/performance-recorder';
import { createDevTimingReporter } from '../src/dev-timing';
import { createDevStateQueue } from '../src/dev-state-queue';
import { ProviderCoordinator } from '../src/provider-coordinator';

describe('performance recorder', () => {
  it('aggregates fast, slow and failed samples while bounding details and quantiles', async () => {
    let now = 0;
    const recorder = new PerformanceRecorder(2, undefined, () => now);
    const timing = createDevTimingReporter(
      { minDurationMs: 50 },
      {
        performance: recorder,
        enabled: () => true,
        log: () => {
          throw new Error('logger');
        },
        now: () => now,
      },
    );
    for (const ms of [1, 2, 100]) {
      await timing.measure('source-transform', 'src/a.ts', () => {
        now += ms;
      });
    }
    const failure = new Error('original error');
    await expect(
      timing.measure('source-transform', 'src/a.ts', () => {
        now += 60;
        throw failure;
      }),
    ).rejects.toBe(failure);
    const report = recorder.snapshot();
    expect(report).toMatchObject({
      completedCount: 4,
      droppedSpans: 2,
      activeCount: 0,
    });
    expect(report.spans).toHaveLength(2);
    expect(report.summaries[0]).toMatchObject({
      count: 4,
      errorCount: 1,
      totalMs: 163,
      maxMs: 100,
      p50Ms: 60,
      p95Ms: 100,
      quantileSampleCount: 2,
      quantileWindow: 'recent',
    });
    expect(JSON.stringify(report)).not.toContain('original error');
  });

  it('does not collect write stages but preserves legacy slow logs and errors', async () => {
    const recorder = new PerformanceRecorder(20);
    const messages: string[] = [];
    const timing = createDevTimingReporter(
      { minDurationMs: 0 },
      {
        performance: recorder,
        enabled: () => true,
        log: (message) => messages.push(message),
      },
    );
    const error = new Error('write failed');
    await expect(
      timing.measure('file-sync', '<project>', () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(messages).toHaveLength(1);
    expect(recorder.snapshot().completedCount).toBe(0);
    expect(recorder.measureSync('config-resolved', '<project>', () => 42)).toBe(
      42,
    );
    expect(() =>
      recorder.measureSync('config-resolved', '<project>', () => {
        throw error;
      }),
    ).toThrow(error);
    expect(recorder.snapshot().summaries[0]).toMatchObject({
      count: 2,
      errorCount: 1,
    });
    expect(recorder.snapshot().activeCount).toBe(0);
  });

  it('keeps concurrent parents separate and links detached work', async () => {
    const recorder = new PerformanceRecorder(20);
    await Promise.all(
      ['src/a.ts', 'src/b.ts'].map((file) =>
        recorder.measure('transform', file, async () => {
          await Promise.resolve();
          await recorder.measure('analysis', file, () => {});
          await recorder.measure(
            'background',
            '<batch>',
            () => {},
            { sourceCount: 2 },
            true,
          );
        }),
      ),
    );
    const { spans } = recorder.snapshot();
    for (const parent of spans.filter((s) => s.stage === 'transform')) {
      const child = spans.find(
        (s) => s.stage === 'analysis' && s.moduleId === parent.moduleId,
      )!;
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.operationId).toBe(parent.operationId);
      const background = spans.find(
        (s) => s.linkedOperationId === parent.operationId,
      )!;
      expect(background.parentSpanId).toBeUndefined();
      expect(background.operationId).not.toBe(parent.operationId);
    }
  });

  it('reports running work without waiting for completion and closes only once', () => {
    let now = 0;
    const recorder = new PerformanceRecorder(1, undefined, () => now);
    const a = recorder.start('wait', 'src/a.ts');
    const b = recorder.start('wait', 'src/b.ts');
    now = 500;
    const report = recorder.snapshot();
    expect(report.activeCount).toBe(2);
    expect(report.active).toHaveLength(1);
    expect(report.active[0]).toMatchObject({
      status: 'running',
      durationMs: 500,
    });
    a.end();
    a.end('error');
    b.end();
    expect(recorder.snapshot()).toMatchObject({
      activeCount: 0,
      completedCount: 2,
    });
  });

  it('separates queue wait from execution and recovers after a failed task', async () => {
    let now = 0;
    const recorder = new PerformanceRecorder(20, undefined, () => now);
    const queue = createDevStateQueue(recorder);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = queue(async () => {
      await gate;
      throw new Error('failed');
    });
    const caught = first.catch(() => {});
    await Promise.resolve();
    const second = queue(() => {
      now += 3;
      return 'done';
    });
    now = 20;
    release();
    await caught;
    expect(await second).toBe('done');
    const spans = recorder.snapshot().spans;
    expect(
      spans
        .filter((s) => s.stage === 'state-queue-wait')
        .map((s) => s.durationMs),
    ).toEqual([0, 20]);
    expect(
      spans.filter((s) => s.stage === 'state-execute').map((s) => s.durationMs),
    ).toEqual([20, 3]);
  });

  it('links provider queue, call and validation with the actual batch id', async () => {
    const recorder = new PerformanceRecorder(30);
    const coordinator = new ProviderCoordinator(async () => [{ en: 'Hello' }], {
      performance: recorder,
      onWarning: () => {},
    });
    const pending = coordinator.request({
      messageId: 'message',
      source: '你好',
      locales: ['en'],
    });
    await coordinator.flush();
    await pending;
    const spans = recorder.snapshot().spans;
    const batch = spans.find((s) => s.stage === 'provider-batch')!;
    expect(batch.status).toBe('ok');
    for (const stage of [
      'provider-queue-wait',
      'provider-call',
      'provider-validation',
      'provider-results',
    ]) {
      expect(spans.find((s) => s.stage === stage)?.details.batchId).toBe(
        batch.details.batchId,
      );
    }
    expect(JSON.stringify(spans)).not.toContain('你好');
    expect(JSON.stringify(spans)).not.toContain('Hello');
  });
});
