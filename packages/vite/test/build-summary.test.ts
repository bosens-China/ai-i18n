import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build, createLogger, type Plugin } from 'vite';
import { aiI18n } from '../src/plugin';
import { ProjectState } from '../src/project-state';
import { formatBuildSummary, summarizeProject } from '../src/build-summary';
import type { AiI18nDiagnosticsOptions } from '../src/options';

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
