import { writeComparison } from './report.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { diagnosticMessage } from '../../packages/core/src/diagnostics.js';
import {
  type BenchmarkMode,
  type BenchmarkSample,
  type ExampleName,
} from './types.js';

const run = promisify(execFile);
const args = process.argv.slice(2);
const rounds = Number(args.find((a) => a.startsWith('--runs='))?.slice(7) ?? 5);
if (
  !Number.isInteger(rounds) ||
  rounds < 3 ||
  rounds > 30 ||
  args.some((a) => !a.startsWith('--runs='))
) {
  throw new Error(
    diagnosticMessage(
      '用法：pnpm perf:examples --runs=5（3–30 轮）',
      'Usage: pnpm perf:examples --runs=5 (3–30 rounds)',
    ),
  );
}
const root = path.resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const tsx = require.resolve('tsx/cli');
const output = path.join(
  root,
  'logs/performance-comparison',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await fs.mkdir(output, { recursive: true });
const samples: BenchmarkSample[] = [];
const modes: BenchmarkMode[] = ['off', 'on', 'profile'];
const examples: ExampleName[] = ['vanilla', 'react', 'vue'];
for (const example of examples) {
  // 每组先各执行一次不计入统计的预热；每个样本仍使用全新进程和目录。
  for (let round = -1; round < rounds; round++) {
    const order = modes.map(
      (_, i) => modes[(i + round + modes.length) % modes.length]!,
    );
    for (const mode of order) {
      const file = path.join(
        output,
        `${example}-${round < 0 ? 'warmup' : round + 1}-${mode}.json`,
      );
      console.info(
        diagnosticMessage(
          `测量 ${example} / ${mode} / ${round < 0 ? '预热' : round + 1}`,
          `Measuring ${example} / ${mode} / ${round < 0 ? 'warmup' : round + 1}`,
        ),
      );
      await run(
        process.execPath,
        [
          tsx,
          path.join(root, 'scripts/performance/worker.ts'),
          example,
          mode,
          file,
        ],
        {
          cwd: root,
          timeout: 60000,
          maxBuffer: 2 * 1024 * 1024,
          env: { ...process.env, NODE_ENV: 'development' },
        },
      );
      if (round >= 0)
        samples.push(
          JSON.parse(await fs.readFile(file, 'utf8')) as BenchmarkSample,
        );
    }
  }
}
await writeComparison(root, output, rounds, samples);
