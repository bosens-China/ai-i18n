import type { Plugin, ResolvedConfig } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { aiI18nPluginApi, type AiI18nPluginApi } from './plugin-api.js';
import {
  REVIEW_CLIENT_MODULE_PATH,
  REVIEW_CLIENT_VIRTUAL_ID,
  REVIEW_WORKBENCH_MODULE_PATH,
} from './review-page.js';
import { configureReviewServer } from './review-server.js';
import { createReviewService } from './review-service.js';

const RESOLVED_REVIEW_CLIENT_ID = `\0${REVIEW_CLIENT_VIRTUAL_ID}`;

export interface AiI18nReviewOptions {
  /** 是否在业务页面注入右下角 Review 入口，默认 true。 */
  launcher?: boolean;
  /** 是否在 Vite Dev 控制台打印独立 Review 地址，默认 true。 */
  printUrl?: boolean;
}

/** 在 Vite Dev 页面显式启用翻译校对工作台。 */
export function aiI18nReview(options: AiI18nReviewOptions = {}): Plugin {
  const launcher = options.launcher !== false;
  const printUrl = options.printUrl !== false;
  let config: ResolvedConfig | undefined;
  let core: AiI18nPluginApi | undefined;

  return {
    name: 'ai-i18n:review',
    apply: 'serve',

    config() {
      return {
        optimizeDeps: { exclude: ['@ai-i18n/vite/review/runtime'] },
      };
    },

    configResolved(resolved) {
      config = resolved;
      const candidates = resolved.plugins.flatMap((plugin) => {
        const api = aiI18nPluginApi(plugin);
        return api ? [api] : [];
      });
      if (candidates.length !== 1) {
        throw new Error(
          diagnosticMessage(
            candidates.length
              ? '[ai-i18n] aiI18nReview() 需要且只支持一个 aiI18n() 核心插件实例。'
              : '[ai-i18n] aiI18nReview() 需要与 aiI18n() 一起注册到 Vite plugins。',
            candidates.length
              ? '[ai-i18n] aiI18nReview() requires exactly one aiI18n() core plugin instance.'
              : '[ai-i18n] Register aiI18nReview() together with aiI18n() in Vite plugins.',
          ),
        );
      }
      core = candidates[0];
    },

    configureServer(server) {
      const api = requiredCore(core);
      return configureReviewServer(
        server,
        createReviewService({
          sourceLang: api.options.sourceLang,
          locales: api.options.locales,
          ready: api.ready,
          state: api.state,
          store: api.store,
          loadPersistedExtracted: () => api.store().loadExtracted(),
          persistedCache: api.persistedCache,
          runStateTask: api.runStateTask,
          flushPersistence: api.flushPersistence,
          notify: api.notify,
        }),
        { printUrl },
      );
    },

    resolveId(id) {
      if (
        id === REVIEW_CLIENT_VIRTUAL_ID ||
        id === REVIEW_CLIENT_MODULE_PATH ||
        id === reviewClientModuleUrl(config?.base)
      ) {
        return RESOLVED_REVIEW_CLIENT_ID;
      }
    },

    load(id) {
      if (id !== RESOLVED_REVIEW_CLIENT_ID) return;
      if (config?.command !== 'serve' || this.environment.name !== 'client') {
        return 'export {};';
      }
      return [
        `import { mountReviewOverlay } from '@ai-i18n/vite/review/runtime';`,
        `mountReviewOverlay({ workbenchModule: ${JSON.stringify(REVIEW_WORKBENCH_MODULE_PATH)} });`,
      ].join('\n');
    },

    transformIndexHtml: {
      order: 'post',
      handler() {
        if (!launcher) return [];
        return [
          {
            tag: 'script',
            attrs: {
              type: 'module',
              src: reviewClientModuleUrl(config?.base),
              'data-ai-i18n-review': '',
            },
            injectTo: 'body',
          },
        ];
      },
    },
  };
}

function reviewClientModuleUrl(base = '/'): string {
  const prefix =
    base && base !== './'
      ? `${base.endsWith('/') ? base : `${base}/`}`.replace(/\/+$/, '/')
      : '/';
  return `${prefix}${REVIEW_CLIENT_MODULE_PATH.slice(1)}`;
}

function requiredCore(core: AiI18nPluginApi | undefined): AiI18nPluginApi {
  if (core) return core;
  throw new Error(
    diagnosticMessage(
      '[ai-i18n] Review 插件在 Vite 配置解析完成前被调用。',
      '[ai-i18n] Review plugin used before Vite config resolution completed.',
    ),
  );
}
