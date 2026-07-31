import { diagnosticMessage } from '@ai-i18n/analyzer';
import type {
  HookHandler,
  NormalizedHotChannel,
  Plugin,
  ResolvedConfig,
} from 'vite';
import { resolveAnalysisDependencies } from './analysis-dependencies.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { TranslationHookBinding } from './extractor.js';
import type { FileStore } from './file-store.js';
import {
  extractFrameworkSource,
  frameworkAutoImports,
  type AiI18nFramework,
} from './framework.js';
import { shouldIgnoreSource, sourceUpdateOptions } from './plugin-utils.js';
import type { ProjectState } from './project-state.js';
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
  store(): FileStore;
  framework(): AiI18nFramework;
  autoImport(): boolean;
  translationHooks(): readonly TranslationHookBinding[];
  requestMissingTranslations(moduleIds: readonly string[]): void;
  runStateTask: DevStateTaskRunner;
  setDevHot(hot: NormalizedHotChannel): void;
  warnSsrOnce(warn: () => void): void;
}

type SourceTransformHandler = HookHandler<NonNullable<Plugin['transform']>>;

export function createSourceTransformHandler(
  dependencies: SourceTransformDependencies,
): SourceTransformHandler {
  return async function transformSource(code, id, transformOptions) {
    if (shouldIgnoreSource(id)) return null;
    const framework = dependencies.framework();
    const extraction = await extractFrameworkSource(code, id, framework);
    if (extraction === null) return null;
    if (transformOptions?.ssr || this.environment.name !== 'client') {
      dependencies.warnSsrOnce(() => {
        this.warn(
          diagnosticMessage(
            '[ai-i18n] 仅支持浏览器 Runtime；已跳过 SSR 转换。',
            '[ai-i18n] Browser runtime only; skipped SSR transformation.',
          ),
        );
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
    await dependencies.ready();

    const autoImport = dependencies.autoImport();
    const translationHooks = dependencies.translationHooks();
    const project = dependencies.state();
    const initialUpdate = await dependencies.runStateTask(() =>
      project.update(
        extraction?.analysisCode ?? code,
        id,
        sourceUpdateOptions(extraction, code, translationHooks, autoImport),
      ),
    );
    if (!initialUpdate) return null;
    let update = initialUpdate;
    const { moduleId } = update;
    const analysisChanged = await resolveAnalysisDependencies(
      this,
      project,
      id,
      moduleId,
      update.result.pending,
      dependencies.runStateTask,
    );
    return dependencies.runStateTask(async () => {
      if (analysisChanged) {
        update = project.update(extraction?.analysisCode ?? code, id, {
          ...sourceUpdateOptions(
            extraction,
            code,
            translationHooks,
            autoImport,
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
        const store = dependencies.store();
        const cache = await store.sync(project.snapshot());
        project.hydrateCache(cache);
        project.hydrateOverrides(await store.loadOverrides());
      }
      dependencies.requestMissingTranslations(update.affectedModuleIds);
      // 只注入没有本地 symbol 的值引用，避免覆盖用户自己的同名函数或变量。
      const unboundReferences = autoImport
        ? new Set(
            findUnboundReferences(
              currentModule,
              new Set(frameworkAutoImports(framework)),
            ),
          )
        : new Set<string>();
      const autoImports = frameworkAutoImports(framework).filter((name) =>
        unboundReferences.has(name),
      );
      const needsRegistration = Boolean(
        result.messages.length || result.pending,
      );
      const macroCalls =
        extraction?.macroCalls ?? findDefineI18nMessagesCalls(currentModule);
      if (!needsRegistration && !autoImports.length && !macroCalls.length) {
        return null;
      }

      return sourceRegistration({
        code,
        id,
        moduleId,
        registerPrefix: dependencies.registerPrefix,
        module: currentModule,
        ...(extraction?.registration
          ? { registration: extraction.registration }
          : {}),
        autoImports,
        needsRegistration,
        macroCalls,
      });
    });
  };
}
