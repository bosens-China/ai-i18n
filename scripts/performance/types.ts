export type BenchmarkMode = 'off' | 'on' | 'profile';
export type ExampleName = 'vanilla' | 'react' | 'vue';

export interface BenchmarkSample {
  example: ExampleName;
  mode: BenchmarkMode;
  sourceCount: number;
  sourceBytes: number;
  startupMs: number;
  firstTransformMs: number;
  cachedTransformMs: number;
  invalidatedTransformMs: number;
  reportFile?: string;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}
