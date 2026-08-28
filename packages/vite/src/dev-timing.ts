import { performance } from 'node:perf_hooks';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { AiI18nTimingDiagnosticsOptions } from './options.js';
import {
  formatTerminalDiagnostic,
  formatTimingDuration,
  formatTimingModule,
  formatTimingStage,
} from './terminal-format.js';

const DEFAULT_MIN_DURATION_MS = 50;

export type DevTimingStage =
  | 'plugin-ready-wait'
  | 'source-analysis'
  | 'source-registration'
  | 'dependency-resolution'
  | 'state-transaction'
  | 'source-transform'
  | 'snapshot-build'
  | 'file-sync'
  | 'extracted-scan'
  | 'translation-memory-sync'
  | 'extracted-write'
  | 'locale-write';

export interface DevTimingReporter {
  measure<T>(
    stage: DevTimingStage,
    moduleId: string,
    task: () => T | PromiseLike<T>,
  ): Promise<T>;
}

interface DevTimingReporterOptions {
  enabled(): boolean;
  log(message: string): void;
  now?(): number;
}

export function createDevTimingReporter(
  timing: boolean | AiI18nTimingDiagnosticsOptions | undefined,
  options: DevTimingReporterOptions,
): DevTimingReporter {
  const minDurationMs = normalizeMinDuration(timing);
  const now = options.now ?? (() => performance.now());

  return {
    async measure(stage, moduleId, task) {
      if (minDurationMs === undefined || !options.enabled()) {
        return await task();
      }
      const startedAt = now();
      try {
        return await task();
      } finally {
        const durationMs = now() - startedAt;
        if (durationMs >= minDurationMs) {
          options.log(timingMessage(stage, durationMs, moduleId));
        }
      }
    },
  };
}

function normalizeMinDuration(
  timing: boolean | AiI18nTimingDiagnosticsOptions | undefined,
): number | undefined {
  if (!timing) return undefined;
  const value =
    timing === true ? DEFAULT_MIN_DURATION_MS : timing.minDurationMs;
  const normalized = value ?? DEFAULT_MIN_DURATION_MS;
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new TypeError(
      diagnosticMessage(
        '[ai-i18n] diagnostics.timing.minDurationMs 必须是非负有限数字。',
        '[ai-i18n] diagnostics.timing.minDurationMs must be a non-negative finite number.',
      ),
    );
  }
  return normalized;
}

function timingMessage(
  stage: DevTimingStage,
  durationMs: number,
  moduleId: string,
): string {
  const duration = durationMs.toFixed(2);
  const module = JSON.stringify(moduleId);
  return formatTerminalDiagnostic(
    diagnosticMessage(
      `[ai-i18n:timing] 阶段=${formatTimingStage(stage)} 耗时=${formatTimingDuration(`${duration}ms`)} 模块=${formatTimingModule(module)}`,
      `[ai-i18n:timing] stage=${formatTimingStage(stage)} durationMs=${formatTimingDuration(duration)} module=${formatTimingModule(module)}`,
    ),
    'timing',
  );
}
