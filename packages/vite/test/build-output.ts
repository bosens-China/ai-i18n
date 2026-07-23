import type { build } from 'vite';

type BuildResult = Awaited<ReturnType<typeof build>>;
type BuildOutput = Extract<BuildResult, { output: unknown }>;

export function buildOutputItems(result: BuildResult) {
  let outputs: BuildOutput[];

  if (Array.isArray(result)) {
    outputs = result;
  } else if ('output' in result) {
    outputs = [result];
  } else {
    throw new TypeError('Expected a completed Vite build output.');
  }

  return outputs.flatMap((output) => output.output);
}
