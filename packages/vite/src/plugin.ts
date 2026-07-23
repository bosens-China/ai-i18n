import type { LangOption, Translator } from '@ai-i18n/core';
import MagicString from 'magic-string';
import type { NormalizedHotChannel, Plugin, ResolvedConfig } from 'vite';
import type { SourceExtractor } from './extractor.js';
import { FileStore } from './file-store.js';
import {
  htmlBridgeCode,
  isTransformedHtml,
  transformHtml,
  type HtmlExtractor,
} from './html.js';
import { ProjectState } from './project-state.js';
import {
  ProviderCoordinator,
  type ProviderCoordinatorOptions,
} from './provider-coordinator.js';
import {
  normalizeOptions,
  normalizeRoot,
  extractSource,
  registrationImportOffset,
  shouldIgnoreSource,
  sourceUpdateOptions,
} from './plugin-utils.js';
import {
  registerCode,
  runtimeCode,
  runtimeStubCode,
} from './virtual-modules.js';
import { AI_I18N_VIRTUAL_MODULE_ID } from './yuku-analyzer.js';

const RESOLVED_RUNTIME_ID = `\0${AI_I18N_VIRTUAL_MODULE_ID}`;
const REGISTER_PREFIX = `${AI_I18N_VIRTUAL_MODULE_ID}/register?module=`;
const RESOLVED_REGISTER_PREFIX = `\0${REGISTER_PREFIX}`;
const JS_TSX_RE = /\.(?:[cm]?js|[cm]?ts|jsx|tsx)(?:\?.*)?$/;
const SOURCE_RE = /\.(?:[cm]?[jt]sx?|vue)(?:\?.*)?$/;
const VIRTUAL_RE = /^virtual:ai-i18n(?:\/register\?module=.+)?$/;
const RESOLVED_VIRTUAL_RE = /^\0virtual:ai-i18n(?:\/register\?module=.+)?$/;
const TRANSLATION_UPDATE_EVENT = 'ai-i18n:update';

export type AiI18nProviderOptions = Pick<
  ProviderCoordinatorOptions,
  'debounceMs' | 'batchLength' | 'maxConcurrency' | 'strict'
>;

export interface AiI18nOptions {
  sourceLang: string;
  defaultLang?: string;
  locales: readonly LangOption[];
  translator?: Translator;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: {
    missingSourceFiles?: boolean;
    orphanMessages?: boolean;
  };
  extractors?: readonly (HtmlExtractor | SourceExtractor)[];
}
export function aiI18n(options: AiI18nOptions): Plugin {
  const normalized = normalizeOptions(options);
  const htmlExtractor = options.extractors?.find(
    (extractor) => extractor.kind === 'html',
  ) as HtmlExtractor | undefined;
  const sourceExtractors = (options.extractors ?? []).filter(
    (extractor): extractor is SourceExtractor => 'test' in extractor,
  );
  const translationHooks = sourceExtractors.flatMap(
    (extractor) => extractor.translationHooks ?? [],
  );
  let config: ResolvedConfig | undefined;
  let state: ProjectState | undefined;
  let store: FileStore | undefined;
  let ready: Promise<void> = Promise.resolve();
  let coordinator: ProviderCoordinator | undefined;
  let devHot: NormalizedHotChannel | undefined;
  let warnedSsr = false;

  function currentState() {
    if (!state) throw new Error('[ai-i18n] plugin used before configResolved');
    return state;
  }

  function currentStore() {
    if (!store)
      throw new Error('[ai-i18n] file store used before configResolved');
    return store;
  }

  function sendTranslationUpdates(moduleIds: readonly string[]) {
    const project = currentState();
    for (const moduleId of new Set(moduleIds)) {
      const messages = project.registration(moduleId);
      if (messages) {
        devHot?.send(TRANSLATION_UPDATE_EVENT, { moduleId, messages });
      }
    }
  }

  function requestMissingTranslations(moduleIds: readonly string[]) {
    if (!coordinator) return;
    const project = currentState();
    for (const moduleId of new Set(moduleIds)) {
      for (const request of project.missingTranslations(moduleId)) {
        // Dev 不等待网络；Build 在注册虚拟模块 load 时统一 flush。
        void coordinator.request(request);
      }
    }
  }

  return {
    name: 'ai-i18n',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved;
      state = new ProjectState(normalizeRoot(resolved.root), normalized);
      store = new FileStore({
        root: normalizeRoot(resolved.root),
        sourceLang: normalized.sourceLang,
        locales: normalized.locales,
        ...(options.directory ? { directory: options.directory } : {}),
        cleanupMissingSourceFiles: options.cleanup?.missingSourceFiles ?? true,
        cleanupOrphanMessages: options.cleanup?.orphanMessages ?? false,
      });
      ready = store.load().then((cache) => {
        currentState().hydrateCache(cache);
      });
      if (options.translator) {
        coordinator = new ProviderCoordinator(options.translator, {
          ...options.provider,
          async onResults(results) {
            const project = currentState();
            const affected = project.applyTranslations(results);
            const cache = await currentStore().sync(project.snapshot());
            project.hydrateCache(cache);
            sendTranslationUpdates(affected);
          },
          onWarning(message) {
            const warning = `[ai-i18n] ${message}`;
            if (resolved.logger) resolved.logger.warn(warning);
            else console.warn(warning);
          },
        });
      }
    },

    async buildStart() {
      await ready;
      if (config?.command === 'build') {
        currentState().reset();
        currentState().hydrateCache(await currentStore().load());
      }
    },

    resolveId: {
      filter: { id: VIRTUAL_RE },
      handler(id) {
        if (id === AI_I18N_VIRTUAL_MODULE_ID) return RESOLVED_RUNTIME_ID;
        if (id.startsWith(REGISTER_PREFIX)) return `\0${id}`;
      },
    },

    load: {
      filter: { id: RESOLVED_VIRTUAL_RE },
      async handler(id, loadOptions) {
        if (loadOptions?.ssr || this.environment.name !== 'client') {
          if (!warnedSsr) {
            warnedSsr = true;
            this.warn(
              '[ai-i18n] SSR runtime is not supported; injection skipped.',
            );
          }
          return id === RESOLVED_RUNTIME_ID ? runtimeStubCode() : 'export {}';
        }
        if (id === RESOLVED_RUNTIME_ID) {
          return runtimeCode(normalized, TRANSLATION_UPDATE_EVENT);
        }
        await ready;
        if (config?.command === 'build') await coordinator?.flush();
        if (config?.command === 'build') {
          const cache = await currentStore().sync(currentState().snapshot());
          currentState().hydrateCache(cache);
        }
        const moduleId = decodeRegisterId(id);
        const messages = currentState().registration(moduleId);
        return messages ? registerCode(moduleId, messages) : 'export {}';
      },
    },

    transform: {
      filter: { id: SOURCE_RE },
      async handler(code, id, transformOptions) {
        if (shouldIgnoreSource(id)) return null;
        const extraction = extractSource(
          code,
          id,
          sourceExtractors,
          JS_TSX_RE.test(id),
        );
        if (extraction === null) return null;
        if (transformOptions?.ssr || this.environment.name !== 'client') {
          if (!warnedSsr) {
            warnedSsr = true;
            this.warn('[ai-i18n] SSR transform skipped; browser runtime only.');
          }
          return null;
        }
        if (config?.command === 'serve' && 'hot' in this.environment) {
          devHot = this.environment.hot as NormalizedHotChannel;
        }
        await ready;

        const project = currentState();
        let update = project.update(
          extraction?.analysisCode ?? code,
          id,
          sourceUpdateOptions(extraction, code, translationHooks),
        );
        if (!update) return null;
        const { moduleId } = update;
        let analysisChanged = false;
        const analyzed = project.analyzer.module(moduleId);
        if (analyzed) {
          for (const imported of analyzed.imports) {
            const resolved = await this.resolve(imported.specifier, id, {
              skipSelf: true,
            });
            if (
              resolved &&
              !resolved.external &&
              !resolved.id.startsWith('\0')
            ) {
              this.addWatchFile(resolved.id);
              analysisChanged =
                project.setResolution(id, imported.specifier, resolved.id) ||
                analysisChanged;
              const targetId = project.normalizeId(resolved.id);
              if (
                update.result.pending &&
                targetId &&
                !project.analyzer.module(targetId)
              ) {
                await this.load({ id: resolved.id });
                analysisChanged = true;
              }
            }
          }
        }
        if (analysisChanged) {
          update = project.update(
            extraction?.analysisCode ?? code,
            id,
            sourceUpdateOptions(extraction, code, translationHooks),
          )!;
        }
        const { result } = update;
        for (const warning of result.warnings) {
          this.warn({
            message: warning.message,
            id,
            loc: { line: warning.line, column: warning.column },
          });
        }
        const cache = await currentStore().sync(project.snapshot());
        project.hydrateCache(cache);
        requestMissingTranslations([moduleId]);
        if (!result.messages.length && !result.pending) return null;

        const importId = `${REGISTER_PREFIX}${encodeURIComponent(moduleId)}`;
        const currentModule = project.analyzer.module(moduleId);
        const registration = extraction?.registration;
        const offset =
          registration?.offset ??
          registrationImportOffset(code, currentModule?.ast.body ?? []);
        const injected = registration
          ? `${registration.prefix ?? ''}import ${JSON.stringify(importId)};\n${registration.suffix ?? ''}`
          : `${offset ? '\n' : ''}import ${JSON.stringify(importId)};\n`;
        const transformed = new MagicString(code, { filename: id });
        transformed.appendLeft(offset, injected);
        return {
          code: transformed.toString(),
          map: transformed.generateMap({
            source: id,
            includeContent: true,
            hires: true,
          }),
        };
      },
    },

    transformIndexHtml: {
      order: 'pre',
      async handler(source, context) {
        // Vite Build 会对同一份 HTML 再跑一次钩子，保留首轮提取结果。
        if (!htmlExtractor || isTransformedHtml(source)) return;
        await ready;
        if (context.server) devHot = context.server.environments.client.hot;
        let result = transformHtml(source, context.filename, htmlExtractor);
        for (const warning of result.warnings) {
          this.warn({
            message: warning.message,
            id: context.filename,
            loc: { line: warning.line, column: warning.column },
          });
        }

        const project = currentState();
        const update = project.updateExtracted(
          source,
          context.filename,
          result.messages,
        );
        if (!update) return;
        let cache = await currentStore().sync(project.snapshot());
        project.hydrateCache(cache);
        requestMissingTranslations([update.moduleId]);
        if (config?.command === 'build') await coordinator?.flush();
        cache = await currentStore().sync(project.snapshot());
        project.hydrateCache(cache);
        const messages = project.registration(update.moduleId);
        if (!messages) return result.code;
        if (config?.command === 'build') {
          result = transformHtml(
            source,
            context.filename,
            htmlExtractor,
            messages[normalized.defaultLang],
          );
        }

        return {
          html: result.code,
          tags: [
            {
              tag: 'script',
              attrs: { type: 'module' },
              children: htmlBridgeCode(
                update.moduleId,
                messages,
                result.bindings,
              ),
              injectTo: 'body',
            },
          ],
        };
      },
    },

    async hotUpdate(options) {
      if (this.environment.name !== 'client') return;
      const project = currentState();
      await ready;
      const fileStore = currentStore();
      if (fileStore.manages(options.file)) {
        const content = await options.read();
        if (fileStore.isOwnWrite(options.file, content)) return [];
        const preferredSource = fileStore.extractedSource(options.file);
        const affected = project.hydrateCache(
          await fileStore.load(preferredSource),
        );
        const reconciled = await fileStore.sync(
          project.snapshot(),
          preferredSource,
        );
        const updated = [...affected, ...project.hydrateCache(reconciled)];
        sendTranslationUpdates(updated);
        requestMissingTranslations(updated);
        return [];
      }
      if (!SOURCE_RE.test(options.file)) return;
      const moduleId = project.normalizeId(options.file);
      if (!moduleId) return;
      const code = options.type === 'delete' ? undefined : await options.read();
      const extraction =
        code === undefined
          ? undefined
          : extractSource(
              code,
              options.file,
              sourceExtractors,
              JS_TSX_RE.test(options.file),
            );
      if (extraction === null) return;
      const affected =
        options.type === 'delete'
          ? project.remove(options.file)
          : (project.update(
              extraction?.analysisCode ?? code!,
              options.file,
              sourceUpdateOptions(extraction, code!, translationHooks),
            )?.affectedModuleIds ?? []);
      const cache = await currentStore().sync(project.snapshot());
      project.hydrateCache(cache);
      const registers = affected
        .map((affectedId) =>
          this.environment.moduleGraph.getModuleById(
            `${RESOLVED_REGISTER_PREFIX}${encodeURIComponent(affectedId)}`,
          ),
        )
        .filter((module) => module !== undefined);
      for (const register of registers) {
        this.environment.moduleGraph.invalidateModule(
          register,
          new Set(),
          options.timestamp,
          true,
        );
      }
      return registers.length ? [...options.modules, ...registers] : undefined;
    },
  };
}

function decodeRegisterId(id: string) {
  return decodeURIComponent(id.slice(RESOLVED_REGISTER_PREFIX.length));
}
