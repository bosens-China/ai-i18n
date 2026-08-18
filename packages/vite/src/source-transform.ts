import type {
  HookHandler,
  NormalizedHotChannel,
  Plugin,
  ResolvedConfig,
} from 'vite';
import { resolveAnalysisDependencies } from './analysis-dependencies.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { DevTimingReporter } from './dev-timing.js';
import type { TranslationHookBinding } from './extractor.js';
import {
  extractFrameworkSource,
  frameworkAutoImports,
  frameworkTranslationAutoImports,
  type AiI18nFramework,
} from './framework.js';
import { shouldIgnoreSource, sourceUpdateOptions } from './plugin-utils.js';
import type { ProjectState } from './project-state.js';
import { ssrWarningMessage } from './ssr-warning.js';
import {
  assertDirectDefineI18nMessagesCalls,
  sourceRegistration,
  transformDefineI18nMessages,
} from './source-registration.js';
import {
  analyzeModule,
  findDefineI18nMessagesCalls,
  findUnboundReferences,
} from './yuku-analyzer.js';

interface SourceTransformDependencies {
  registerPrefix: string;
  config(): ResolvedConfig | undefined;
  ready(): Promise<void>;
  state(): ProjectState;
  moduleId(id: string): string;
  timing: DevTimingReporter;
  framework(): AiI18nFramework;
  autoImport(): boolean;
  translationHooks(): readonly TranslationHookBinding[];
  requestMissingTranslations(moduleIds: readonly string[]): void;
  runStateTask: DevStateTaskRunner;
  persist(moduleId: string): void;
  setDevHot(hot: NormalizedHotChannel): void;
  warnSsrOnce(warn: () => void): void;
}

type SourceTransformHandler = HookHandler<NonNullable<Plugin['transform']>>;

export function createSourceTransformHandler(
  dependencies: SourceTransformDependencies,
): SourceTransformHandler {
  return async function transformSource(code, id, transformOptions) {
    if (shouldIgnoreSource(id)) return null;
    const normalizedId = dependencies.moduleId(id);
    const framework = dependencies.framework();
    const extraction = await dependencies.timing.measure(
      'source-analysis',
      normalizedId,
      () => extractFrameworkSource(code, id, framework),
    );
    if (extraction === null) return null;
    if (transformOptions?.ssr || this.environment.name !== 'client') {
      dependencies.warnSsrOnce(() => {
        this.warn(ssrWarningMessage('transformation'));
      });
      const macroModule = analyzeModule(
        extraction?.analysisCode ?? code,
        id.split('?')[0] ?? id,
        undefined,
        extraction?.analysisLang,
      );
      assertDirectDefineI18nMessagesCalls(macroModule);
      const macroCalls =
        extraction?.macroCalls ?? findDefineI18nMessagesCalls(macroModule);
      return transformDefineI18nMessages(code, id, macroCalls);
    }
    const config = dependencies.config();
    if (config?.command === 'serve' && 'hot' in this.environment) {
      dependencies.setDevHot(this.environment.hot as NormalizedHotChannel);
    }
    await dependencies.timing.measure(
      'plugin-ready-wait',
      normalizedId,
      dependencies.ready,
    );

    const autoImport = dependencies.autoImport();
    const translationAutoImports = autoImport
      ? frameworkTranslationAutoImports(framework)
      : false;
    const translationHooks = dependencies.translationHooks();
    const project = dependencies.state();
    const initialUpdate = await dependencies.timing.measure(
      'state-transaction',
      normalizedId,
      () =>
        dependencies.runStateTask(() =>
          project.update(
            extraction?.analysisCode ?? code,
            id,
            sourceUpdateOptions(
              extraction,
              code,
              translationHooks,
              translationAutoImports,
            ),
          ),
        ),
    );
    if (!initialUpdate) return null;
    let update = initialUpdate;
    const { moduleId } = update;
    const analysisChanged = await dependencies.timing.measure(
      'dependency-resolution',
      normalizedId,
      () =>
        resolveAnalysisDependencies(
          this,
          project,
          id,
          moduleId,
          update.result.pending,
          dependencies.runStateTask,
        ),
    );
    return dependencies.timing.measure('state-transaction', normalizedId, () =>
      dependencies.runStateTask(async () => {
        if (analysisChanged) {
          update = project.update(extraction?.analysisCode ?? code, id, {
            ...sourceUpdateOptions(
              extraction,
              code,
              translationHooks,
              translationAutoImports,
            ),
            force: true,
          })!;
        }
        const currentModule = project.analyzer.module(moduleId)!;
        assertDirectDefineI18nMessagesCalls(currentModule);
        const { result } = update;
        for (const warning of result.warnings) {
          this.warn({
            message: warning.message,
            id,
            loc: { line: warning.line, column: warning.column },
          });
        }
        if (config?.command !== 'build') {
          dependencies.persist(moduleId);
        }
        dependencies.requestMissingTranslations(update.affectedModuleIds);
        // 只注入没有本地 symbol 的值引用，避免覆盖用户自己的同名函数或变量。
        const autoImportModule =
          extraction?.autoImportCode === undefined
            ? currentModule
            : analyzeModule(
                extraction.autoImportCode,
                `${id.split('?')[0] ?? id}?auto-import`,
                undefined,
                extraction.autoImportLang,
              );
        const unboundReferences = autoImport
          ? new Set(
              findUnboundReferences(
                autoImportModule,
                new Set(frameworkAutoImports(framework)),
              ),
            )
          : new Set<string>();
        const autoImports = frameworkAutoImports(framework).filter((name) =>
          unboundReferences.has(name),
        );
        const templateImports = [
          ...(extraction?.templateImports ?? []),
          ...(autoImport
            ? (extraction?.templateAutoImportCandidates ?? [])
            : []),
        ];
        const needsRegistration = Boolean(
          result.messages.length || result.pending,
        );
        const macroCalls =
          extraction?.macroCalls ?? findDefineI18nMessagesCalls(currentModule);
        if (
          !needsRegistration &&
          !autoImports.length &&
          !templateImports.length &&
          !macroCalls.length
        ) {
          return null;
        }

        return dependencies.timing.measure(
          'source-registration',
          normalizedId,
          () =>
            sourceRegistration({
              code,
              id,
              moduleId,
              registerPrefix: dependencies.registerPrefix,
              module: currentModule,
              ...(extraction?.registration
                ? { registration: extraction.registration }
                : {}),
              ...(extraction?.templateRegistration
                ? { templateRegistration: extraction.templateRegistration }
                : {}),
              autoImports,
              templateImports,
              needsRegistration,
              macroCalls,
            }),
        );
      }),
    );
  };
}
