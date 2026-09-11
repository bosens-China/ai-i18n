import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { version as viteVersion } from 'vite';
import { diagnosticMessage } from '../../packages/core/src/diagnostics.js';
import type { PerformanceReport } from '../../packages/vite/src/performance-types.js';
import {
  median,
  type BenchmarkMode,
  type BenchmarkSample,
  type ExampleName,
} from './types.js';

export async function writeComparison(
  root: string,
  output: string,
  rounds: number,
  samples: BenchmarkSample[],
) {
  const modes: BenchmarkMode[] = ['off', 'on', 'profile'];
  const examples: ExampleName[] = ['vanilla', 'react', 'vue'];
  const metrics = [
    'startupMs',
    'firstTransformMs',
    'cachedTransformMs',
    'invalidatedTransformMs',
  ] as const;
  const summary = examples.flatMap((example) =>
    metrics.map((metric) => {
      const values = Object.fromEntries(
        modes.map((mode) => [
          mode,
          median(
            samples
              .filter((s) => s.example === example && s.mode === mode)
              .map((s) => s[metric]),
          ),
        ]),
      ) as Record<BenchmarkMode, number>;
      return {
        example,
        metric,
        ...values,
        pluginDeltaMs: values.on - values.off,
        diagnosticsDeltaMs: values.profile - values.on,
      };
    }),
  );
  const profiles = await Promise.all(
    samples
      .filter((s) => s.mode === 'profile')
      .map(async (s) => ({
        example: s.example,
        report: JSON.parse(
          await fs.readFile(path.join(output, s.reportFile!), 'utf8'),
        ) as PerformanceReport,
      })),
  );
  const stages = examples.flatMap((example) => {
    const reports = profiles
      .filter((p) => p.example === example)
      .map((p) => p.report);
    return [
      'config',
      'config-resolved',
      'configure-server',
      'initialization',
      'translation-memory-load',
      'overrides-load',
      'state-hydrate',
      'html-transform',
      'plugin-ready-wait',
      'source-transform',
      'source-analysis',
      'source-registration',
      'dependency-resolution',
      'state-queue-wait',
      'state-execute',
    ].map((stage) => ({
      example,
      stage,
      medianTotalMs: median(
        reports.map(
          (r) => r.summaries.find((s) => s.stage === stage)?.totalMs ?? 0,
        ),
      ),
      medianCount: median(
        reports.map(
          (r) => r.summaries.find((s) => s.stage === stage)?.count ?? 0,
        ),
      ),
    }));
  });
  const transforms = examples.flatMap((example) =>
    [false, true].flatMap((cacheHit) =>
      [
        'source-transform',
        'source-analysis',
        'dependency-resolution',
        'state-execute',
        'source-registration',
      ].map((stage) => ({
        example,
        cacheHit,
        stage,
        medianTotalMs: median(
          profiles
            .filter((p) => p.example === example)
            .map(({ report }) => {
              const operations = new Set(
                report.spans
                  .filter(
                    (s) =>
                      s.stage === 'source-transform' &&
                      s.details.cacheHit === cacheHit,
                  )
                  .map((s) => s.operationId),
              );
              return report.spans
                .filter(
                  (s) => operations.has(s.operationId) && s.stage === stage,
                )
                .reduce((sum, s) => sum + s.durationMs, 0);
            }),
        ),
      })),
    ),
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rounds,
    environment: {
      node: process.version,
      vite: viteVersion,
      platform: `${os.platform()}-${os.arch()}`,
      cpu: os.cpus()[0]?.model,
    },
    methodology: diagnosticMessage(
      '各样本使用独立进程和临时副本，操作系统文件缓存已预热，复用现有 TM。统一关闭 Provider、Review、依赖预构建及自动预转换，按相同顺序请求 src 源码。三组保留相同配置依赖导入，仅改变插件注册与采集。关闭插件的基线只提供虚拟模块解析占位，不执行浏览器代码。数据为服务端墙钟耗时，不能等同页面渲染时间。后台写入正常执行但不单独统计，结束时等待其完成仅用于清理。各组取中位数，单次差异不构成性能变化的因果证据。',
      'Fresh processes and fixture copies; OS cache warmed; existing TM; no Provider, Review, dependency optimization or pretransform; all local src modules requested sequentially. Same config dependency imports in all modes; plugin registration differs. Baseline only resolves virtual imports; no browser execution. Quantities are server-side wall time, not page render time. Persistence runs normally but is not measured separately; final draining is cleanup only. Report uses median per mode; differences are not causal proof from a single run.',
    ),
    summary,
    stages,
    transforms,
    samples,
  };
  await fs.writeFile(
    path.join(output, 'comparison.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  const markdown = [
    diagnosticMessage('# 演示性能对比', '# Example performance comparison'),
    '',
    `Node ${process.version} · Vite ${viteVersion} · ${os.platform()} ${os.arch()} · ${diagnosticMessage(`${rounds} 轮`, `${rounds} rounds`)}`,
    '',
    report.methodology,
    '',
    diagnosticMessage(
      '| 示例 | 指标 | 关闭插件 ms | 开启插件 ms | 开启采集 ms | 插件增量 ms | 采集增量 ms |',
      '| Example | Metric | Off ms | On ms | Profile ms | Plugin Δ ms | Diagnostics Δ ms |',
    ),
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...summary.map(
      (s) =>
        `| ${s.example} | ${s.metric} | ${s.off.toFixed(2)} | ${s.on.toFixed(2)} | ${s.profile.toFixed(2)} | ${s.pluginDeltaMs.toFixed(2)} | ${s.diagnosticsDeltaMs.toFixed(2)} |`,
    ),
    '',
    diagnosticMessage('## 插件阶段', '## Plugin stages'),
    '',
    diagnosticMessage(
      '下表为 profile 整段会话的阶段累计值中位数，包含首次与缓存失效后的转换；父子阶段和并发阶段不可相加。等待时间不是 CPU 时间。',
      'Median stage totals cover the entire profiled session, including first and invalidated transforms. Nested and concurrent stages overlap; do not sum them. Waiting is not CPU time.',
    ),
    '',
    diagnosticMessage(
      '| 示例 | 阶段 | 累计耗时中位数 ms | 次数中位数 |',
      '| Example | Stage | Median total ms | Median count |',
    ),
    '| --- | --- | ---: | ---: |',
    ...stages.map(
      (s) =>
        `| ${s.example} | ${s.stage} | ${s.medianTotalMs.toFixed(2)} | ${s.medianCount} |`,
    ),
    '',
    diagnosticMessage(
      '## 转换缓存命中分组',
      '## Transforms by analysis cache hit',
    ),
    '',
    diagnosticMessage(
      '按插件分析缓存是否命中拆分累计耗时；本夹具对应首次与源码不变的再次转换，不代表真实编辑 HMR。子阶段仍不可相加。',
      'Totals grouped by plugin analysis cache hit; in these fixtures they describe first and unchanged repeat transforms, not real edit HMR. Nested stages still overlap.',
    ),
    '',
    diagnosticMessage(
      '| 示例 | 分析缓存命中 | 阶段 | 累计耗时中位数 ms |',
      '| Example | Analysis cache hit | Stage | Median total ms |',
    ),
    '| --- | --- | --- | ---: |',
    ...transforms.map(
      (s) =>
        `| ${s.example} | ${s.cacheHit} | ${s.stage} | ${s.medianTotalMs.toFixed(2)} |`,
    ),
    '',
  ].join('\n');
  await fs.writeFile(path.join(output, 'comparison.md'), markdown);
  console.info(markdown);
  console.info(
    diagnosticMessage(
      `报告目录：${path.relative(root, output)}`,
      `Report directory: ${path.relative(root, output)}`,
    ),
  );
}
