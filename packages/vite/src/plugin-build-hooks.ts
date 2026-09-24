import type { Plugin, ResolvedConfig } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { formatBuildSummary, summarizeProject } from './build-summary.js';
import { createBuildWatchState } from './build-watch.js';
import type { DevTimingReporter } from './dev-timing.js';
import type { FileStore } from './file-store.js';
import { SOURCE_RE } from './framework.js';
import { injectBuiltLocaleHints } from './locale-loading.js';
import { renderLocaleChunk } from './locale-module-loader.js';
import type { createPerformanceDiagnostics } from './performance-diagnostics.js';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';
import { formatTerminalDiagnostic } from './terminal-format.js';

interface BuildDependencies {
  config(): ResolvedConfig | undefined;
  ready(): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  normalized: NormalizedAiI18nOptions;
  summary: boolean;
  failOnMissingTranslations: boolean;
  timing: DevTimingReporter;
  performance: ReturnType<typeof createPerformanceDiagnostics>;
  requestMissingTranslations(moduleIds: readonly string[]): void;
  flushProvider(): Promise<void>;
  flushPersistence(): Promise<void>;
  dispose(config: ResolvedConfig): void | Promise<void>;
  closeStore(): Promise<void> | undefined;
}

export function createPluginBuildHooks(options: BuildDependencies) {
  const buildWatch = createBuildWatchState({
    sourcePattern: SOURCE_RE,
    ready: options.ready,
    state: options.state,
    store: options.store,
    requestMissingTranslations: options.requestMissingTranslations,
  });
  let generated = false;
  let reported = false;
  const reconcile = (moduleIds: Iterable<string>, complete = false) =>
    options.timing.measure('build-reconcile', '<project>', () =>
      buildWatch.reconcile(moduleIds, complete),
    );
  const report = () => {
    if (reported) return;
    reported = true;
    const lines = [
      ...(generated && options.summary
        ? [formatBuildSummary(summarizeProject(options.state()))]
        : []),
      options.performance?.summary(),
    ].filter(Boolean);
    if (lines.length)
      options
        .config()
        ?.logger.info(formatTerminalDiagnostic(lines.join('\n'), 'info'));
  };
  const hooks: Pick<
    Plugin,
    | 'buildStart'
    | 'buildEnd'
    | 'watchChange'
    | 'renderChunk'
    | 'generateBundle'
    | 'renderError'
    | 'writeBundle'
    | 'closeBundle'
  > = {
    async buildStart() {
      if (options.config()?.command !== 'build') return;
      generated = false;
      reported = false;
      await options.timing.measure('build-start', '<project>', () =>
        buildWatch.buildStart(this.meta.watchMode),
      );
    },
    buildEnd(error) {
      if (error) generated = false;
    },
    async watchChange(id, change) {
      if (options.config()?.command === 'build' && this.meta.watchMode)
        await buildWatch.watchChange(id, change.event);
    },
    async renderChunk(code, chunk) {
      return options.timing.measure('locale-render', '<project>', () =>
        renderLocaleChunk(this, code, chunk.facadeModuleId, {
          project: options.state(),
          store: options.store(),
          flush: options.flushProvider,
          reconcile,
        }),
      );
    },
    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        const config = options.config();
        if (config?.command !== 'build') return;
        if (options.failOnMissingTranslations) await options.flushProvider();
        await reconcile(this.getModuleIds(), true);
        if (
          options.failOnMissingTranslations &&
          this.environment.name === 'client'
        ) {
          const missing = summarizeProject(options.state()).locales.filter(
            (locale) => locale.missing > 0,
          );
          if (missing.length) {
            const counts = missing
              .map(({ locale, missing }) => `${locale}: ${missing}`)
              .join(', ');
            throw new Error(
              diagnosticMessage(
                `[ai-i18n] 构建失败：存在未翻译文案（${counts}）。`,
                `[ai-i18n] Build failed: missing translations (${counts}).`,
              ),
            );
          }
        }
        injectBuiltLocaleHints(bundle, config, options.normalized);
        generated = this.environment.name === 'client';
      },
    },
    renderError() {
      generated = false;
    },
    async writeBundle() {
      // Vite Watch 不等待 BUNDLE_END 中的异步 closeBundle；在本轮输出 hook 内完成汇总。
      if (!options.config()?.build.watch) return;
      await options.performance?.flush();
      report();
    },
    async closeBundle() {
      const config = this.environment.getTopLevelConfig();
      try {
        await options.dispose(config);
        await options.flushPersistence();
        if (config?.command !== 'build' || !config.build.watch)
          await options.closeStore();
      } finally {
        await options.performance?.close();
      }
      if (config?.command === 'build' && !config.build.watch) report();
    },
  };
  return { hooks, reconcile };
}
