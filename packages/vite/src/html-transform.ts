import type {
  HtmlTagDescriptor,
  IndexHtmlTransformContext,
  IndexHtmlTransformResult,
  MinimalPluginContextWithoutEnvironment,
  NormalizedHotChannel,
  ResolvedConfig,
} from 'vite';
import type { FileStore } from './file-store.js';
import {
  htmlBridgeCode,
  isTransformedHtml,
  transformHtml,
  type HtmlExtractor,
} from './html.js';
import { localeHintTags } from './locale-loading.js';
import type { NormalizedAiI18nOptions, ProjectState } from './project-state.js';

interface HtmlTransformDependencies {
  extractor?: HtmlExtractor;
  options: NormalizedAiI18nOptions;
  config(): ResolvedConfig | undefined;
  ready(): Promise<void>;
  state(): ProjectState;
  store(): FileStore;
  requestMissingTranslations(moduleIds: readonly string[]): void;
  flush(): Promise<void>;
  setDevHot(hot: NormalizedHotChannel): void;
}

export function createHtmlTransformHandler(
  dependencies: HtmlTransformDependencies,
) {
  return async function transformIndexHtml(
    this: MinimalPluginContextWithoutEnvironment,
    source: string,
    context: IndexHtmlTransformContext,
  ): Promise<IndexHtmlTransformResult | void> {
    const config = dependencies.config();
    const hintTags = config
      ? localeHintTags(config, context, dependencies.options)
      : [];
    const extractor = dependencies.extractor;
    // Vite Build 会对同一份 HTML 再跑一次钩子；第二轮只补最终 hash 资源提示。
    if (!extractor || isTransformedHtml(source)) {
      return withTags(source, hintTags);
    }

    await dependencies.ready();
    if (context.server) {
      dependencies.setDevHot(context.server.environments.client.hot);
    }
    let result = transformHtml(source, context.filename, extractor);
    for (const warning of result.warnings) {
      this.warn({
        message: warning.message,
        id: context.filename,
        loc: { line: warning.line, column: warning.column },
      });
    }

    const project = dependencies.state();
    const update = project.updateExtracted(
      source,
      context.filename,
      result.messages,
    );
    if (!update) return withTags(result.code, hintTags);
    let cache = await dependencies.store().sync(project.snapshot());
    project.hydrateCache(cache);
    dependencies.requestMissingTranslations([update.moduleId]);
    if (config?.command === 'build') await dependencies.flush();
    cache = await dependencies.store().sync(project.snapshot());
    project.hydrateCache(cache);

    const registrationLocale = dependencies.options.loading
      ? dependencies.options.sourceLang
      : undefined;
    const messages = project.registration(update.moduleId, registrationLocale);
    if (!messages) return withTags(result.code, hintTags);
    if (config?.command === 'build') {
      const initialLocale = dependencies.options.loading
        ? dependencies.options.sourceLang
        : dependencies.options.defaultLang;
      result = transformHtml(
        source,
        context.filename,
        extractor,
        messages[initialLocale],
      );
    }

    return {
      html: result.code,
      tags: [
        ...hintTags,
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: htmlBridgeCode(update.moduleId, messages, result.bindings),
          injectTo: 'body',
        },
      ],
    };
  };
}

function withTags(
  html: string,
  tags: HtmlTagDescriptor[],
): IndexHtmlTransformResult | void {
  return tags.length ? { html, tags } : undefined;
}
