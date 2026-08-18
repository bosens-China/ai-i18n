import { describe, expect, it } from 'vitest';
import type { ConfigEnv } from 'vite';
import { optimizeDevRuntimeDependencies } from '../src/dev-optimize-deps';

const serve = { command: 'serve', mode: 'development' } satisfies ConfigEnv;

describe('Dev Runtime dependency optimization', () => {
  it('keeps injected pure ESM entries out of late dependency discovery', () => {
    expect(optimizeDevRuntimeDependencies(serve)).toEqual({
      optimizeDeps: {
        exclude: [
          '@ai-i18n/vite/runtime',
          '@ai-i18n/vite/vue',
          '@ai-i18n/vite/react',
        ],
      },
    });
  });

  it('does not change Build dependency optimization', () => {
    expect(
      optimizeDevRuntimeDependencies({ command: 'build', mode: 'production' }),
    ).toBeUndefined();
  });
});
