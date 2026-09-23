import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build, createLogger, type Plugin } from 'vite';
import { aiI18n } from '../src/plugin';
import { ProjectState } from '../src/project-state';
import { formatBuildSummary, summarizeProject } from '../src/build-summary';
import type { AiI18nDiagnosticsOptions, AiI18nOptions } from '../src/options';

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
const options = {
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
};

it('deduplicates messages while requiring coverage at every occurrence', () => {
  const project = new ProjectState('/workspace', options);
  for (const file of ['a.ts', 'b.ts'])
    project.update(
      "import { t } from 'virtual:ai-i18n'; t('重复'); t('重复');",
      `/workspace/${file}`,
    );
  project.hydrateOverrides({
    version: 2,
    rules: [
      {
        source: '重复',
        translations: { 'en-US': 'Reviewed' },
        files: ['a.ts'],
      },
    ],
  });
  expect(summarizeProject(project)).toMatchObject({
    message_count: 1,
    file_count: 2,
    locales: [
      { locale: 'en-US', missing: 1 },
      { locale: 'ja-JP', missing: 1 },
    ],
  });
  project.hydrateOverrides({
    version: 2,
    rules: [{ source: '重复', translations: { 'en-US': 'Reviewed' } }],
  });
  const summary = summarizeProject(project);
  expect(summary.locales[0]).toEqual({
    locale: 'en-US',
    translated: 1,
    missing: 0,
  });
  expect(project.requestTranslations('a.ts')).toMatchObject([
    { locales: ['ja-JP'] },
  ]);
  vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
  expect(formatBuildSummary(summary)).toContain('已翻译 1，未翻译 0');
});

async function run(
  diagnostics?: AiI18nDiagnosticsOptions,
  extra: Plugin[] = [],
  pluginOptions: Partial<AiI18nOptions> = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-summary-'));
  roots.push(root);
  await fs.writeFile(
    path.join(root, 'main.ts'),
    "import { t } from 'virtual:ai-i18n'; console.log(t('你好'));",
  );
  const logger = createLogger('silent');
  const info = vi.spyOn(logger, 'info');
  const input = {
    root,
    configFile: false as const,
    customLogger: logger,
    plugins: [
      aiI18n({
        ...options,
        diagnostics,
        provider: {
          translator: async ({ messages }) =>
            messages.map(() => ({ 'en-US': 'Hello', 'ja-JP': 'こんにちは' })),
        },
        ...pluginOptions,
      }),
      ...extra,
    ],
    resolve: {
      alias: {
        '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
      },
    },
    build: {
      write: false,
      lib: { entry: path.join(root, 'main.ts'), formats: ['es' as const] },
    },
  };
  return { input, info };
}

it('prints default coverage after Provider and combines performance into one report', async () => {
  for (const diagnostics of [undefined, { performance: true }]) {
    const { input, info } = await run(diagnostics);
    await build(input);
    const logs = info.mock.calls
      .map(([message]) => message)
      .filter((message) => message.includes('[ai-i18n'));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('en-US  translated 1, missing 0');
    expect(logs[0]).toContain('ja-JP  translated 1, missing 0');
    expect(logs[0]?.includes('[ai-i18n:performance]')).toBe(
      Boolean(diagnostics),
    );
  }
});

it('keeps missing translations non-fatal by default and blocks output when enabled', async () => {
  const normal = await run(undefined, [], { provider: undefined });
  await build(normal.input);
  expect(
    normal.info.mock.calls.some(([message]) =>
      message.includes('en-US  translated 0, missing 1'),
    ),
  ).toBe(true);

  const gated = await run({ buildSummary: false }, [], {
    provider: undefined,
    failOnMissingTranslations: true,
  });
  vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', 'zh-CN');
  await expect(
    build({ ...gated.input, build: { ...gated.input.build, write: true } }),
  ).rejects.toThrow('构建失败：存在未翻译文案（en-US: 1, ja-JP: 1）');
  expect(
    await fs.readdir(path.join(gated.input.root, 'dist')).catch(() => []),
  ).toEqual([]);
  expect(
    gated.info.mock.calls.some(([message]) => message.includes('构建文案')),
  ).toBe(false);
});

it('checks final coverage after Provider and accepts empty translated strings', async () => {
  const partial = await run(undefined, [], {
    failOnMissingTranslations: true,
    provider: {
      translator: async ({ messages }) =>
        messages.map(() => ({ 'en-US': '', 'ja-JP': null })),
    },
  });
  await expect(build(partial.input)).rejects.toThrow(
    'Build failed: missing translations (ja-JP: 1)',
  );

  const complete = await run(undefined, [], {
    failOnMissingTranslations: true,
  });
  await expect(build(complete.input)).resolves.toBeDefined();
});

it('includes extracted HTML text in the build gate', async () => {
  const { input } = await run(undefined, [], {
    provider: undefined,
    html: true,
    failOnMissingTranslations: true,
  });
  await fs.writeFile(
    path.join(input.root, 'index.html'),
    '<title>t(\'主页\')</title><script type="module" src="/main.ts"></script>',
  );
  await fs.writeFile(path.join(input.root, 'main.ts'), 'console.log("ready")');
  await expect(build({ ...input, build: { write: false } })).rejects.toThrow(
    'Build failed: missing translations (en-US: 1, ja-JP: 1)',
  );
});

it('rechecks active messages on each watch build', async () => {
  const { input } = await run(undefined, [], {
    provider: undefined,
    failOnMissingTranslations: true,
  });
  const watcher = await build({
    ...input,
    build: { ...input.build, write: true, watch: {} },
  });
  if (Array.isArray(watcher) || !('on' in watcher))
    throw new Error('Expected watcher');
  const errors: Error[] = [];
  let completed = 0;
  watcher.on('event', (event) => {
    if (event.code === 'ERROR' && event.error) errors.push(event.error);
    if (event.code === 'BUNDLE_END') completed++;
  });
  try {
    await vi.waitFor(
      () =>
        expect(
          errors.some((error) =>
            error.message.includes('missing translations'),
          ),
        ).toBe(true),
      { timeout: 5000 },
    );
    await fs.writeFile(
      path.join(input.root, 'main.ts'),
      'console.log("done");',
    );
    await vi.waitFor(() => expect(completed).toBeGreaterThan(0), {
      timeout: 5000,
    });
  } finally {
    await watcher.close();
  }
}, 10000);

it('respects the summary switch independently of performance and suppresses failed-build coverage', async () => {
  const disabled = await run({ buildSummary: false, performance: true });
  await build(disabled.input);
  expect(
    disabled.info.mock.calls.some(([message]) =>
      message.includes('Build messages'),
    ),
  ).toBe(false);
  expect(
    disabled.info.mock.calls.filter(([message]) =>
      message.includes('[ai-i18n:performance]'),
    ),
  ).toHaveLength(1);
  const failed = await run(undefined, [
    {
      name: 'fail-render',
      renderChunk() {
        throw new Error('failed output');
      },
    },
  ]);
  await expect(build(failed.input)).rejects.toThrow();
  expect(
    failed.info.mock.calls.some(([message]) =>
      message.includes('Build messages'),
    ),
  ).toBe(false);
});

it('refreshes coverage for each watch build, including removed messages', async () => {
  const { input, info } = await run({ performance: true });
  input.root = await fs.realpath(input.root);
  input.build.lib.entry = path.join(input.root, 'main.ts');
  const watcher = await build({
    ...input,
    build: { ...input.build, write: true, watch: {} },
  });
  if (Array.isArray(watcher) || !('on' in watcher))
    throw new Error('Expected watcher');
  const reports = () =>
    info.mock.calls
      .map(([message]) => message)
      .filter((message) => message.includes('Build messages'));
  try {
    await vi.waitFor(
      () => expect(reports().at(-1)).toContain('Build messages: 1'),
      { timeout: 5000 },
    );
    await fs.writeFile(
      path.join(input.root, 'main.ts'),
      'console.log("done");',
    );
    await vi.waitFor(
      () => expect(reports().at(-1)).toContain('Build messages: 0'),
      { timeout: 5000 },
    );
    expect(
      reports().every((report) => report.includes('[ai-i18n:performance]')),
    ).toBe(true);
  } finally {
    await watcher.close();
  }
}, 10000);
