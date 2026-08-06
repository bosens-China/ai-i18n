import type { LangOption, Translator } from '@ai-i18n/core';
import type { TranslationMemoryStorage } from '@ai-i18n/core/translation-memory';
import type { AiI18nFramework } from './framework.js';
import type { HtmlExtractorOptions } from './html.js';
import type { ProviderCoordinatorOptions } from './provider-coordinator.js';

export type AiI18nProviderOptions = Pick<
  ProviderCoordinatorOptions,
  'debounceMs' | 'batchLength' | 'maxConcurrency' | 'strict'
> & {
  translator: Translator;
  /** 是否在当前 Vite 进程中刷新一次 Provider 自动翻译；默认 reuse。 */
  cache?: 'reuse' | 'fresh';
};

export interface AiI18nLocaleLoadingOptions {
  preload?: readonly string[];
  prefetch?: readonly string[];
}

export interface AiI18nCacheOptions {
  maxMessages?: number;
  maxBytes?: number;
}

export interface AiI18nTranslationMemoryOptions {
  /** 持久化驱动；默认使用项目内可提交的分片 JSON。 */
  storage?: TranslationMemoryStorage;
}

export interface AiI18nPersistOptions {
  key: string;
}

export interface AiI18nOptions {
  framework?: AiI18nFramework;
  /** 启用当前框架模式的自动导入；默认关闭。 */
  autoImport?: boolean;
  dts?: string | false;
  /** 源文案语言；用于识别 source locale，且不会生成对应的 locale 文件。 */
  sourceLang: string;
  /** 无有效持久化值时的 Runtime 初始语言；省略时继承 sourceLang。 */
  defaultLang?: string;
  /** Runtime 可切换的语言列表，需要包含 sourceLang 与 defaultLang。 */
  locales: readonly LangOption[];
  /** 持久化用户语言偏好；true 使用默认 key。 */
  persist?: boolean | AiI18nPersistOptions;
  loading?: AiI18nLocaleLoadingOptions;
  cache?: AiI18nCacheOptions;
  translationMemory?: AiI18nTranslationMemoryOptions;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: {
    missingSourceFiles?: boolean;
    orphanMessages?: boolean;
  };
  html?: boolean | HtmlExtractorOptions;
}
