import type { LangOption } from '@ai-i18n/core';
import type { TranslationMemoryCandidateCacheAdapter } from '@ai-i18n/core/translation-memory';
import type { AiI18nFramework } from './framework.js';
import type { HtmlExtractorOptions } from './html.js';
import type { AiI18nPerformanceDiagnosticsOptions } from './performance-types.js';
import type { TranslationAdapter } from './translation-adapter.js';
export type { AiI18nPerformanceDiagnosticsOptions } from './performance-types.js';

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
  /** 完整 Build 成功写出后默认清理；Dev 不清理，设为 false 可保留历史供审查。 */
  orphanMessages?: boolean;
}

export interface AiI18nTimingDiagnosticsOptions {
  /** 只输出达到该耗时的 Dev 阶段；默认 50ms。 */
  minDurationMs?: number;
}

export interface AiI18nDiagnosticsOptions {
  /** Build 完成后输出有效译文覆盖率；默认开启。 */
  buildSummary?: boolean;
  /** 显式开启 Dev 阶段耗时诊断；默认关闭。 */
  timing?: boolean | AiI18nTimingDiagnosticsOptions;
  /** Dev / Build 启动与转换的有界性能报告；不单独统计写入，默认关闭。 */
  performance?: boolean | AiI18nPerformanceDiagnosticsOptions;
}

export interface AiI18nOptions {
  adapter?: TranslationAdapter;
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
  /** 目标语言始终按需分包；对象可配置 preload/prefetch 提示。 */
  loading?: boolean | AiI18nLocaleLoadingOptions;
  /** Build 中存在目标语言缺译时失败；默认关闭。 */
  failOnMissingTranslations?: boolean;
  directory?: string;
  diagnostics?: AiI18nDiagnosticsOptions;
  /** 默认提取 HTML 中显式的翻译表达式；false 关闭。 */
  html?: boolean | HtmlExtractorOptions;
}
