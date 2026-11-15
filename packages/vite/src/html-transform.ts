import type {
  HtmlTagDescriptor,
  IndexHtmlTransformContext,
  IndexHtmlTransformResult,
  MinimalPluginContextWithoutEnvironment,
  ResolvedConfig,
} from 'vite';
import path from 'node:path';
import { fileId, fileMessageKey } from './repository-paths.js';
import type { DevStateTaskRunner } from './dev-state-queue.js';
import type { FileStore } from './file-store.js';
import {
  htmlBridgeCode,
  htmlBindingKey,
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
  runStateTask: DevStateTaskRunner;
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
    const pageTags = hintTags;
    const extractor = dependencies.extractor;
    // Vite Build 会对同一份 HTML 再跑一次钩子；第二轮只补最终 hash 资源提示。
    if (!extractor || isTransformedHtml(source)) {
      return withTags(source, pageTags);
    }

    await dependencies.ready();
    let result = transformHtml(source, context.filename, extractor);
    for (const warning of result.warnings) {
      this.warn({
        message: warning.message,
        id: context.filename,
        loc: { line: warning.line, column: warning.column },
      });
    }

    const committed = await dependencies.runStateTask(async () => {
      const project = dependencies.state();
      const update = project.updateExtracted(
        source,
        context.filename,
        result.messages,
      );
      if (!update) return null;
      const registrationLocale = dependencies.options.loading
        ? dependencies.options.sourceLang
        : undefined;
      return {
        moduleId: update.moduleId,
        messages: project.registration(update.moduleId, registrationLocale),
      };
    });
    if (!committed) return withTags(result.code, pageTags);
    const { messages, moduleId } = committed;
    if (!messages) return withTags(result.code, pageTags);
    if (config?.command === 'build') {
      const initialLocale = dependencies.options.loading
        ? dependencies.options.sourceLang
        : dependencies.options.defaultLang;
      const initialMessages = Object.fromEntries(
        result.messages.flatMap((message) =>
          message.locations.map((location) => {
            const occurrence = `${location.line}:${location.column}`;
            return [
              htmlBindingKey(message.id, occurrence),
              messages[initialLocale]?.[
                message.scope === 'file'
                  ? fileMessageKey(
                      fileId(
                        dependencies.state().root,
                        path.resolve(dependencies.state().root, moduleId),
                      ),
                      message.id,
                    )
                  : message.id
              ] ?? null,
            ];
          }),
        ),
      );
      result = transformHtml(
        source,
        context.filename,
        extractor,
        initialMessages,
      );
    }

    return {
      html: result.code,
      tags: [
        ...pageTags,
        {
          tag: 'script',
          attrs: { type: 'module' },
          children: htmlBridgeCode(
            moduleId,
            messages,
            result.bindings,
            fileId(
              dependencies.state().root,
              path.resolve(dependencies.state().root, moduleId),
            ),
          ),
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
