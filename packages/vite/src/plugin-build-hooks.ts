import type { Plugin, ResolvedConfig } from 'vite';
import { buildCleanup } from './build-cleanup.js';
import { assertBuildTranslations } from './build-missing.js';
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
import type { createPluginRemote } from './plugin-remote.js';
import type { RemoteBuildValues } from './remote-build.js';

interface BuildDependencies {
  remote?: ReturnType<typeof createPluginRemote>;
  remoteBuild?: RemoteBuildValues;
  config(): ResolvedConfig | undefined;
  ready(): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  normalized: NormalizedAiI18nOptions;
  summary: boolean;
  failOnMissingTranslations: boolean;
  timing: DevTimingReporter;
  performance: ReturnType<typeof createPerformanceDiagnostics>;
  requestMissingTranslations(
    moduleIds: readonly string[],
  ): void | Promise<void>;
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
    | 'options'
    | 'buildStart'
    | 'buildEnd'
    | 'watchChange'
    | 'renderChunk'
    | 'generateBundle'
    | 'renderError'
    | 'writeBundle'
    | 'closeBundle'
  > = {
    options(input) {
      const config = options.config();
      if (config?.command !== 'build') return;
      return {
        ...input,
        plugins: [
          input.plugins,
          buildCleanup(
            config,
            () => options.store().cleanupHistory(options.state().snapshot()),
            options.closeStore,
          ),
        ],
      };
    },
    async buildStart() {
      if (options.config()?.command !== 'build') return;
      generated = false;
      reported = false;
      await options.timing.measure('build-start', '<project>', () =>
        buildWatch.buildStart(this.meta.watchMode),
      );
    },
    buildEnd: {
      order: 'post',
      sequential: true,
      async handler(error) {
        if (error) {
          generated = false;
          return;
        }
        if (
          options.config()?.command !== 'build' ||
          this.environment.name !== 'client'
        )
          return;
        await options.ready();
        options.state().retain(this.getModuleIds());
        if (options.remote) await options.remote.build();
        await options.flushProvider();
        await reconcile(this.getModuleIds(), true);
        if (options.failOnMissingTranslations)
          assertBuildTranslations(
            options.state(),
            options.store().directory,
            Boolean(options.remote),
          );
      },
    },
    async watchChange(id, change) {
      if (options.config()?.command === 'build' && this.meta.watchMode)
        await buildWatch.watchChange(id, change.event);
    },
    async renderChunk(code, chunk) {
      const rendered = await options.timing.measure(
        'locale-render',
        '<project>',
        () =>
          renderLocaleChunk(this, code, chunk.facadeModuleId, {
            project: options.state(),
            store: options.store(),
            flush: options.flushProvider,
            reconcile,
          }),
      );
      return (
        options.remoteBuild?.render(rendered ?? code, chunk.fileName) ??
        rendered
      );
    },
    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        const config = options.config();
        if (config?.command !== 'build') return;
        injectBuiltLocaleHints(bundle, config, options.normalized);
        if (options.remoteBuild) {
          for (const item of Object.values(bundle)) {
            if (
              item.type === 'asset' &&
              item.fileName.endsWith('.html') &&
              typeof item.source === 'string'
            ) {
              item.source = options.remoteBuild.renderHtml(item.source);
            }
          }
        }
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
        if (config?.command !== 'build') await options.closeStore();
      } finally {
        await options.performance?.close();
      }
      if (config?.command === 'build' && !config.build.watch) report();
    },
  };
  return { hooks, reconcile };
}
