import type { LangOption, Translator } from '@ai-i18n/core';
import type { TranslationMemoryCandidateCacheAdapter } from '@ai-i18n/core/translation-memory';
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
  /** false/省略关闭，true 使用 root/logs，字符串表示相对 root 或绝对日志目录。 */
  logging?: boolean | string;
};

export interface AiI18nLocaleLoadingOptions {
  preload?: readonly string[];
  prefetch?: readonly string[];
}

export interface AiI18nTranslationMemoryCapacityOptions {
  maxMessages?: number;
  maxBytes?: number;
}

export interface AiI18nTranslationMemoryOptions {
  /** 可选的个人候选缓存；项目译文始终写入可提交的 JSON 分片。 */
  cache?: TranslationMemoryCandidateCacheAdapter;
  /** 限制当前项目的历史 Translation Memory 容量。 */
  capacity?: AiI18nTranslationMemoryCapacityOptions;
}

export interface AiI18nPersistOptions {
  key: string;
}

export interface AiI18nCleanupOptions {
  missingSourceFiles?: boolean;
  orphanMessages?: boolean;
}

export interface AiI18nTimingDiagnosticsOptions {
  /** 只输出达到该耗时的 Dev 阶段；默认 50ms。 */
  minDurationMs?: number;
}

export interface AiI18nDiagnosticsOptions {
  /** 显式开启 Dev 阶段耗时诊断；默认关闭。 */
  timing?: boolean | AiI18nTimingDiagnosticsOptions;
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
  translationMemory?: AiI18nTranslationMemoryOptions;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: AiI18nCleanupOptions;
  diagnostics?: AiI18nDiagnosticsOptions;
  html?: boolean | HtmlExtractorOptions;
}
