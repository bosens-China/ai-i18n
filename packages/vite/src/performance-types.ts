export interface AiI18nPerformanceDiagnosticsOptions {
  /** 相对 Vite root 的报告目录；默认 logs/performance，不接受绝对路径或上级目录。 */
  directory?: string;
  /** 最近完成阶段和单阶段分位数窗口上限；默认 2000，最大 10000。 */
  maxSamples?: number;
}

export interface PerformanceDetails {
  batchId?: string;
  sourceBytes?: number;
  sourceCount?: number;
  messageCount?: number;
  localeCount?: number;
  cacheHit?: boolean;
}

export interface PerformanceSpan {
  spanId: string;
  operationId: string;
  parentSpanId?: string;
  linkedOperationId?: string;
  stage: string;
  moduleId: string;
  startMs: number;
  durationMs: number;
  status: 'running' | 'ok' | 'error';
  details: PerformanceDetails;
}

export interface PerformanceSummary {
  stage: string;
  count: number;
  errorCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  totalMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  quantileSampleCount: number;
  quantileWindow: 'all' | 'recent';
}

export interface PerformanceReport {
  schemaVersion: 1;
  runId: string;
  startedAt: string;
  elapsedMs: number;
  command?: string;
  framework?: string;
  node: string;
  platform: string;
  maxSamples: number;
  completedCount: number;
  droppedSpans: number;
  activeCount: number;
  summaries: PerformanceSummary[];
  spans: PerformanceSpan[];
  active: PerformanceSpan[];
}
