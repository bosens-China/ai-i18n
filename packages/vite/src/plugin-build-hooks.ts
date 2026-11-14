import type { Plugin, ResolvedConfig } from 'vite';
import { buildCleanup } from './build-cleanup.js';
import { createBuildWatchState } from './build-watch.js';
import type { DevTimingReporter } from './dev-timing.js';
import type { FileStore } from './file-store.js';
import { SOURCE_RE } from './framework.js';
import { injectBuiltLocaleHints } from './locale-loading.js';
import { renderLocaleChunk } from './locale-module-loader.js';
import type { createPerformanceDiagnostics } from './performance-diagnostics.js';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';
import { formatTerminalDiagnostic } from './terminal-format.js';
import { buildFileGroups } from './file-groups.js';
import { materializeLocale } from './locale-materialization.js';
import type { PreparedRepository } from './repository-store.js';
import { repositoryCoverage } from './repository-coverage.js';
import { resolveRepositoryFileBase } from './repository-runtime-code.js';
import type { TranslationAdapter } from './translation-adapter.js';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';

interface BuildDependencies {
  adapter?: TranslationAdapter;
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
  let cleanupLegacy = false;
  let reported = false;
  let prepared: PreparedRepository | undefined;
  let repositorySummary: string | undefined;
  const reconcile = (moduleIds: Iterable<string>, complete = false) =>
    options.timing.measure('build-reconcile', '<project>', () =>
      buildWatch.reconcile(moduleIds, complete),
    );
  const report = () => {
    if (reported) return;
    reported = true;
    const lines = [
      ...(generated && options.summary && repositorySummary
        ? [repositorySummary]
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
      cleanupLegacy = false;
      reported = false;
      prepared = undefined;
      repositorySummary = undefined;
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
        await options.flushProvider();
        await reconcile(this.getModuleIds(), true);
        if (options.store().repository) {
          const state = options.state();
          let total = 0;
          let missing = 0;
          prepared = await options.store().repository!.prepare(
            Object.values(state.snapshot().extracted),
            options.normalized.sourceLang,
            options.normalized.locales.map((locale) => locale.value),
            options.adapter,
          );
          for (const locale of options.normalized.locales) {
            if (locale.value === options.normalized.sourceLang) continue;
            const generated = materializeLocale(
              prepared.catalog,
              locale.value,
              prepared.manual.global[locale.value] ?? {},
              prepared.manual.files[locale.value] ?? {},
              prepared.snapshot,
            );
            state.setRepositoryLocale(locale.value, generated.global);
            const coverage = repositoryCoverage(
              state.root,
              prepared.files,
              generated,
            );
            total += coverage.total;
            missing += coverage.missing.length;
            if (options.failOnMissingTranslations && coverage.missing.length)
              throw new Error(
                diagnosticMessage(
                  `[ai-i18n] 语言“${locale.value}”缺少 ${coverage.missing.length} 条译文：${coverage.missing.slice(0, 10).join('、')}。`,
                  `[ai-i18n] Locale "${locale.value}" is missing ${coverage.missing.length} translations: ${coverage.missing.slice(0, 10).join(', ')}.`,
                ),
              );
          }
          repositorySummary = diagnosticMessage(
            `[ai-i18n] 构建译文覆盖率：${total - missing}/${total}。`,
            `[ai-i18n] Build translation coverage: ${total - missing}/${total}.`,
          );
        }
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
      const output = rendered ?? code;
      const resolved = resolveRepositoryFileBase(output, chunk.fileName);
      return resolved === output ? rendered : resolved;
    },
    generateBundle: {
      order: 'post',
      async handler(_outputOptions, bundle) {
        const config = options.config();
        if (config?.command !== 'build') return;
        if (
          prepared &&
          options.store().repository &&
          this.environment.name === 'client'
        ) {
          const repository = options.store().repository!;
          const groups = buildFileGroups(config.root, prepared.files, bundle);
          const outputs = await repository.commit(prepared, groups, false);
          for (const [file, value] of outputs) {
            const relative = path
              .relative(path.join(repository.directory, 'locales'), file)
              .replaceAll('\\', '/');
            this.emitFile({
              type: 'asset',
              fileName: `locales/${relative}`,
              source: `${JSON.stringify(value)}\n`,
            });
          }
          prepared = undefined;
          cleanupLegacy = true;
        }
        injectBuiltLocaleHints(bundle, config, options.normalized);
        generated = this.environment.name === 'client';
      },
    },
    renderError() {
      generated = false;
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (cleanupLegacy && this.environment.name === 'client') {
          await options.store().repository!.cleanupLegacy();
          cleanupLegacy = false;
        }
        // Vite Watch 不等待 BUNDLE_END 中的异步 closeBundle；在本轮输出 hook 内完成汇总。
        if (!options.config()?.build.watch) return;
        await options.performance?.flush();
        report();
      },
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
