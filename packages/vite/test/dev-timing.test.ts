import { stripVTControlCharacters } from 'node:util';
import { describe, expect, it, vi } from 'vitest';
import { createDevTimingReporter } from '../src/dev-timing';

describe('Dev timing diagnostics', () => {
  it('stays silent by default', async () => {
    const log = vi.fn();
    const timing = createDevTimingReporter(undefined, {
      enabled: () => true,
      log,
    });

    await expect(
      timing.measure('source-transform', 'src/main.ts', async () => 'done'),
    ).resolves.toBe('done');
    expect(log).not.toHaveBeenCalled();
  });

  it('reports enabled stages at or above the configured threshold', async () => {
    const log = vi.fn();
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(10)
      .mockReturnValueOnce(15)
      .mockReturnValueOnce(20)
      .mockReturnValueOnce(31);
    const timing = createDevTimingReporter(
      { minDurationMs: 10 },
      { enabled: () => true, log, now },
    );

    await timing.measure('source-transform', 'src/fast.ts', async () => {});
    await timing.measure('file-sync', 'src/slow.ts', async () => {});

    expect(log).toHaveBeenCalledTimes(1);
    expect(stripVTControlCharacters(log.mock.calls[0]?.[0] ?? '')).toMatch(
      /stage=file-sync durationMs=11\.00 module="src\/slow\.ts"/,
    );
  });

  it('uses the configured diagnostic locale', async () => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
    const log = vi.fn();
    const timing = createDevTimingReporter(
      { minDurationMs: 0 },
      {
        enabled: () => true,
        log,
        now: vi
          .fn<() => number>()
          .mockReturnValueOnce(1)
          .mockReturnValueOnce(2),
      },
    );

    await timing.measure('source-registration', 'src/page.ts', async () => {});

    expect(stripVTControlCharacters(log.mock.calls[0]?.[0] ?? '')).toContain(
      '阶段=source-registration 耗时=1.00ms 模块="src/page.ts"',
    );
  });

  it('rejects an invalid threshold', () => {
    expect(() =>
      createDevTimingReporter(
        { minDurationMs: -1 },
        { enabled: () => true, log: () => {} },
      ),
    ).toThrow(/minDurationMs/);
  });
});
