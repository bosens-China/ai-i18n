import fs from 'node:fs/promises';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { ResolvedConfig } from 'vite';
import { PerformanceRecorder } from './performance-recorder.js';
import type { AiI18nPerformanceDiagnosticsOptions } from './performance-types.js';

export function createPerformanceDiagnostics(
  option: boolean | AiI18nPerformanceDiagnosticsOptions | undefined,
  config: () => ResolvedConfig | undefined,
  framework: () => string,
  protocolDirectory: string | undefined,
) {
  if (option === undefined || option === false) return undefined;
  const validObject =
    typeof option === 'object' && option !== null && !Array.isArray(option);
  const options = validObject ? option : {};
  const directory = options.directory ?? 'logs/performance';
  const maxSamples = options.maxSamples ?? 2000;
  if (
    (option !== true && !validObject) ||
    typeof directory !== 'string' ||
    !directory.trim() ||
    path.isAbsolute(directory) ||
    directory.split(/[\\/]/).includes('..') ||
    !Number.isInteger(maxSamples) ||
    maxSamples < 1 ||
    maxSamples > 10000
  ) {
    throw new TypeError(
      diagnosticMessage(
        '[ai-i18n] diagnostics.performance 需要相对报告目录和 1–10000 的整数 maxSamples。',
        '[ai-i18n] diagnostics.performance requires a relative report directory and an integer maxSamples from 1 to 10000.',
      ),
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending = Promise.resolve();
  let dirty = false;
  let warned = false;
  let closed = false;
  let writing = false;
  const recorder = new PerformanceRecorder(maxSamples, () => {
    dirty = true;
    schedule();
  });
  function schedule() {
    // 限制写入频率；开始事件也触发快照，卡住的任务仍然可见。
    if (timer || closed) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, 1000);
    timer.unref();
  }

  function validateDirectory(): string {
    const resolved = config()!;
    const output = path.resolve(resolved.root, directory);
    const protocol = path.resolve(resolved.root, protocolDirectory ?? 'i18n');
    const relative = path.relative(protocol, output);
    if (
      !relative ||
      (!relative.startsWith(`..${path.sep}`) &&
        relative !== '..' &&
        !path.isAbsolute(relative))
    ) {
      throw new TypeError(
        diagnosticMessage(
          '[ai-i18n] 性能报告目录不能位于 i18n 协议目录内。',
          '[ai-i18n] Performance reports must be outside the i18n protocol directory.',
        ),
      );
    }
    return output;
  }

  function flush(): Promise<void> {
    if (!config() || !dirty || writing) return pending;
    dirty = false;
    writing = true;
    pending = pending
      .then(async () => {
        const report = {
          ...recorder.snapshot(),
          command: config()!.command,
          framework: framework(),
        };
        const output = validateDirectory();
        await fs.mkdir(output, { recursive: true });
        const file = path.join(output, `${report.runId}.json`);
        const temporary = `${file}.tmp`;
        try {
          await fs.writeFile(temporary, JSON.stringify(report, null, 2) + '\n');
          await fs.rename(temporary, file);
        } finally {
          await fs.rm(temporary, { force: true });
        }
        const summary = report.summaries
          .slice(0, 5)
          .map((s) => `${s.stage}=${s.totalMs.toFixed(1)}ms (${s.count})`)
          .join(', ');
        const relativeFile = path
          .relative(config()!.root, file)
          .split(path.sep)
          .join('/');
        config()!.logger.info(
          diagnosticMessage(
            `[ai-i18n:performance] ${report.completedCount} 个阶段，进行中 ${report.activeCount}；${summary}\n报告：${relativeFile}（累计阶段不可相加作为总耗时）`,
            `[ai-i18n:performance] ${report.completedCount} spans, ${report.activeCount} active; ${summary}\nReport: ${relativeFile} (stage totals overlap; do not sum as wall time)`,
          ),
        );
      })
      .catch(() => {
        if (warned) return;
        warned = true;
        try {
          config()?.logger.warn(
            diagnosticMessage(
              '[ai-i18n] 性能报告写入失败，插件继续运行。请检查报告目录权限。',
              '[ai-i18n] Performance report could not be written; the plugin will continue. Check report directory permissions.',
            ),
          );
        } catch {
          /* 诊断接收器不得改变业务结果。 */
        }
      })
      .finally(() => {
        writing = false;
        if (dirty) schedule();
      });
    return pending;
  }

  return {
    recorder,
    validateDirectory,
    owns(file: string): boolean {
      if (!config()) return false;
      const relative = path.relative(
        path.resolve(config()!.root, directory),
        path.resolve(file),
      );
      return (
        !relative ||
        (!relative.startsWith(`..${path.sep}`) &&
          relative !== '..' &&
          !path.isAbsolute(relative))
      );
    },
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
      dirty = true;
      await flush();
      if (dirty) await flush();
    },
  };
}
