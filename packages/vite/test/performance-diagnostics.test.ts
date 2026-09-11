import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, createServer, type ResolvedConfig } from 'vite';
import { aiI18n } from '../src/plugin';
import { aiI18nPluginApi } from '../src/plugin-api';
import { createPerformanceDiagnostics } from '../src/performance-diagnostics';
import type { PerformanceReport } from '../src/performance-types';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((d) => fs.rm(d, { recursive: true, force: true })),
  );
});
async function root() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-perf-'));
  directories.push(directory);
  return directory;
}
async function report(directory: string): Promise<PerformanceReport> {
  const base = path.join(directory, 'logs/performance');
  const files = await fs.readdir(base);
  expect(files).toHaveLength(1);
  return JSON.parse(
    await fs.readFile(path.join(base, files[0]!), 'utf8'),
  ) as PerformanceReport;
}
const options = {
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

describe('performance reports', () => {
  it('is absent by default and rejects invalid or protocol output directories', async () => {
    expect(
      createPerformanceDiagnostics(
        false,
        () => undefined,
        () => 'vanilla',
        undefined,
      ),
    ).toBeUndefined();
    for (const option of [
      { maxSamples: 0 },
      { maxSamples: 10001 },
      { directory: '../report' },
      { directory: '/tmp/report' },
    ]) {
      expect(() =>
        createPerformanceDiagnostics(
          option,
          () => undefined,
          () => 'vanilla',
          undefined,
        ),
      ).toThrow();
    }
    const directory = await root();
    const diagnostics = createPerformanceDiagnostics(
      { directory: 'i18n/logs' },
      () => ({ root: directory }) as ResolvedConfig,
      () => 'vanilla',
      undefined,
    )!;
    expect(() => diagnostics.validateDirectory()).toThrow();
    expect(diagnostics.owns(path.join(directory, 'i18n/logs/run.json'))).toBe(
      true,
    );
    expect(
      diagnostics.owns(path.join(directory, 'i18n/logs-other/run.json')),
    ).toBe(false);
  });

  it('does not fail plugin work when the report destination is unwritable', async () => {
    const directory = await root();
    await fs.writeFile(path.join(directory, 'logs'), 'file blocks directory');
    const warn = vi.fn();
    const diagnostics = createPerformanceDiagnostics(
      true,
      () =>
        ({
          root: directory,
          command: 'serve',
          logger: { warn },
        }) as unknown as ResolvedConfig,
      () => 'vanilla',
      undefined,
    )!;
    expect(
      await diagnostics.recorder.measure('test', '<project>', () => 42),
    ).toBe(42);
    await expect(diagnostics.close()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('captures startup and transforms without recording writes or changing output', async () => {
    const directory = await root();
    await fs.writeFile(
      path.join(directory, 'main.js'),
      "import { t } from 'virtual:ai-i18n'; console.log(t('你好'));\n",
    );
    const plugin = aiI18n({ ...options, diagnostics: { performance: true } });
    const server = await createServer({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      plugins: [plugin],
      server: {
        middlewareMode: true,
        watch: null,
        preTransformRequests: false,
      },
      optimizeDeps: { noDiscovery: true, include: [] },
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
    });
    try {
      await aiI18nPluginApi(plugin)!.ready();
      const ignoreReport = plugin.hotUpdate as (event: {
        file: string;
      }) => unknown;
      expect(
        await ignoreReport({
          file: path.join(server.config.root, 'logs/performance/session.json'),
        }),
      ).toEqual([]);

      expect((await server.transformRequest('/main.js'))?.code).toContain(
        '你好',
      );
      await aiI18nPluginApi(plugin)!.flushPersistence();
    } finally {
      await server.close();
    }
    const result = await report(directory);
    expect(result.command).toBe('serve');
    expect(result.activeCount).toBe(0);
    expect(result.summaries.map((s) => s.stage)).toEqual(
      expect.arrayContaining([
        'initialization',
        'source-transform',
        'state-queue-wait',
        'state-execute',
        'config-resolved',
        'config',
        'configure-server',
      ]),
    );
    expect(
      result.spans.some((s) =>
        /write|persistence|file-sync|snapshot-build|extracted-scan|translation-memory-sync/.test(
          s.stage,
        ),
      ),
    ).toBe(false);
    expect(JSON.stringify(result)).not.toContain(directory);
    expect(JSON.stringify(result)).not.toContain('你好');
  });

  it('captures Build even though the legacy Dev slow logger is disabled', async () => {
    const directory = await root();
    await fs.writeFile(
      path.join(directory, 'index.html'),
      '<script type="module" src="/main.js"></script>',
    );
    await fs.writeFile(
      path.join(directory, 'main.js'),
      "import { t } from 'virtual:ai-i18n'; console.log(t('你好'));\n",
    );
    await build({
      root: directory,
      configFile: false,
      logLevel: 'silent',
      plugins: [
        aiI18n({
          ...options,
          diagnostics: { performance: true },
          provider: {
            translator: async (batch) =>
              batch.messages.map(() => ({ 'en-US': 'Hello' })),
          },
        }),
      ],
      resolve: {
        alias: {
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
    });
    const result = await report(directory);
    expect(result.command).toBe('build');
    const batch = result.spans.find((s) => s.stage === 'provider-batch')!;
    expect(batch).toBeDefined();
    expect(result.spans.some((s) => s.stage === 'provider-persisted')).toBe(
      false,
    );
    expect(result.summaries.map((s) => s.stage)).toEqual(
      expect.arrayContaining([
        'build-start',
        'source-transform',
        'build-reconcile',
      ]),
    );
    expect(result.activeCount).toBe(0);
  });
});
