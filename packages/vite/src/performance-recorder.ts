import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type {
  PerformanceDetails,
  PerformanceReport,
  PerformanceSpan,
  PerformanceSummary,
} from './performance-types.js';

export interface PerformanceHandle {
  end(status?: 'ok' | 'error', details?: PerformanceDetails): void;
  run<T>(task: () => T): T;
}

interface StageSamples {
  count: number;
  errorCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
}

export class PerformanceRecorder {
  private readonly context = new AsyncLocalStorage<PerformanceSpan>();
  private readonly runId = randomUUID();
  private readonly startedAt = new Date().toISOString();
  private readonly started: number;
  private sequence = 0;
  private completedCount = 0;
  private activeCount = 0;
  private readonly active = new Map<string, PerformanceSpan>();
  private readonly spans: PerformanceSpan[] = [];
  private readonly summaries = new Map<string, StageSamples>();

  constructor(
    private readonly maxSamples: number,
    private readonly changed: () => void = () => {},
    private readonly now: () => number = () => performance.now(),
  ) {
    this.started = now();
  }

  currentModule(): string {
    return this.context.getStore()?.moduleId ?? '<project>';
  }

  annotate(details: PerformanceDetails): void {
    const current = this.context.getStore();
    if (current?.status === 'running') Object.assign(current.details, details);
  }

  start(
    stage: string,
    moduleId: string,
    details: PerformanceDetails = {},
    detached = false,
  ): PerformanceHandle {
    const parent = this.context.getStore();
    const id = String(++this.sequence);
    // 已完成的父任务不能继续包含后来执行的后台阶段。
    const nested = !detached && parent?.status === 'running';
    const span: PerformanceSpan = {
      spanId: id,
      operationId: nested ? parent.operationId : id,
      ...(nested ? { parentSpanId: parent.spanId } : {}),
      ...(!nested && parent ? { linkedOperationId: parent.operationId } : {}),
      stage,
      moduleId,
      startMs: this.now() - this.started,
      durationMs: 0,
      status: 'running',
      details: { ...details },
    };
    this.activeCount++;
    if (this.active.size < this.maxSamples) this.active.set(id, span);
    this.changed();
    return {
      run: (task) => this.context.run(span, task),
      end: (status = 'ok', details) => {
        if (span.status !== 'running') return;
        span.durationMs = Math.max(0, this.now() - this.started - span.startMs);
        span.status = status;
        Object.assign(span.details, details);
        this.active.delete(id);
        this.activeCount--;
        const summary = this.summaries.get(stage) ?? {
          count: 0,
          errorCount: 0,
          cacheHitCount: 0,
          cacheMissCount: 0,
          totalMs: 0,
          maxMs: 0,
          samples: [],
        };
        summary.count++;
        summary.errorCount += status === 'error' ? 1 : 0;
        summary.cacheHitCount += span.details.cacheHit === true ? 1 : 0;
        summary.cacheMissCount += span.details.cacheHit === false ? 1 : 0;
        summary.totalMs += span.durationMs;
        summary.maxMs = Math.max(summary.maxMs, span.durationMs);
        summary.samples[(summary.count - 1) % this.maxSamples] =
          span.durationMs;
        this.summaries.set(stage, summary);
        this.spans[this.completedCount++ % this.maxSamples] = span;
        this.changed();
      },
    };
  }

  measureSync<T>(stage: string, moduleId: string, task: () => T): T {
    const handle = this.start(stage, moduleId);
    try {
      const result = handle.run(task);
      handle.end();
      return result;
    } catch (error) {
      handle.end('error');
      throw error;
    }
  }

  async measure<T>(
    stage: string,
    moduleId: string,
    task: () => T | PromiseLike<T>,
    details?: PerformanceDetails,
    detached = false,
  ): Promise<T> {
    const handle = this.start(stage, moduleId, details, detached);
    try {
      const value = await handle.run(task);
      handle.end();
      return value;
    } catch (error) {
      handle.end('error');
      throw error;
    }
  }

  snapshot(): PerformanceReport {
    const elapsedMs = this.now() - this.started;
    const summaries: PerformanceSummary[] = [...this.summaries].map(
      ([stage, s]) => {
        const sorted = [...s.samples].sort((a, b) => a - b);
        return {
          stage,
          count: s.count,
          errorCount: s.errorCount,
          cacheHitCount: s.cacheHitCount,
          cacheMissCount: s.cacheMissCount,
          totalMs: s.totalMs,
          maxMs: s.maxMs,
          p50Ms: sorted[Math.ceil(sorted.length * 0.5) - 1]!,
          p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1]!,
          quantileSampleCount: sorted.length,
          quantileWindow: s.count > sorted.length ? 'recent' : 'all',
        };
      },
    );
    return {
      schemaVersion: 1,
      runId: this.runId,
      startedAt: this.startedAt,
      elapsedMs,
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      maxSamples: this.maxSamples,
      completedCount: this.completedCount,
      droppedSpans: Math.max(0, this.completedCount - this.spans.length),
      activeCount: this.activeCount,
      summaries: summaries.sort((a, b) => b.totalMs - a.totalMs),
      spans: this.spans
        .map((s) => ({ ...s, details: { ...s.details } }))
        .sort((a, b) => a.startMs - b.startMs),
      active: [...this.active.values()].map((s) => ({
        ...s,
        details: { ...s.details },
        durationMs: elapsedMs - s.startMs,
      })),
    };
  }
}
