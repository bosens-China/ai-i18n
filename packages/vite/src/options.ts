import type {
  LangOption,
  MissingTranslationFallback,
  Translator,
} from '@ai-i18n/core';
import type { AiI18nFramework } from './framework.js';
import type { HtmlExtractorOptions } from './html.js';
import type { ProviderCoordinatorOptions } from './provider-coordinator.js';

export type AiI18nProviderOptions = Pick<
  ProviderCoordinatorOptions,
  'debounceMs' | 'batchLength' | 'maxConcurrency' | 'strict'
>;

export interface AiI18nLocaleLoadingOptions {
  strategy: 'locale';
  preload?: readonly string[];
  prefetch?: readonly string[];
}

export interface AiI18nCacheOptions {
  maxMessages?: number;
  maxBytes?: number;
}

export interface AiI18nPersistOptions {
  key: string;
}

export interface AiI18nOptions {
  framework?: AiI18nFramework;
  autoImport?: boolean;
  dts?: string | false;
  /** 源文案的语言；用于 fallback，不会生成对应的 locale 文件。 */
  sourceLang: string;
  /** Runtime 初始语言；省略时继承 sourceLang。 */
  defaultLang?: string;
  /** Runtime 可切换的语言列表，需要包含 sourceLang 与 defaultLang。 */
  locales: readonly LangOption[];
  /** 持久化用户语言偏好；true 使用默认 key。 */
  persist?: boolean | AiI18nPersistOptions;
  /** 首次加载时按浏览器语言选择最接近的 locale。 */
  detect?: false | 'navigator';
  /** 目标语言缺译时的显示策略。 */
  fallback?: MissingTranslationFallback;
  loading?: AiI18nLocaleLoadingOptions;
  cache?: AiI18nCacheOptions;
  translator?: Translator;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: {
    missingSourceFiles?: boolean;
    orphanMessages?: boolean;
  };
  html?: boolean | HtmlExtractorOptions;
}
