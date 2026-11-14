---
title: AiI18nOptions
description: ai-i18n.config.ts 的配置字段
---

```ts
import type { AiI18nOptions } from '@ai-i18n/vite';

interface AiI18nOptions {
  sourceLang: string;
  locales: readonly { value: string; label: string }[];
  defaultLang?: string;
  adapter?: TranslationAdapter;
  framework?: 'vanilla' | 'vue' | 'react';
  autoImport?: boolean;
  dts?: string | false;
  persist?: boolean | { key: string };
  loading?:
    boolean | { preload?: readonly string[]; prefetch?: readonly string[] };
  failOnMissingTranslations?: boolean;
  directory?: string;
  diagnostics?: AiI18nDiagnosticsOptions;
  html?: boolean | HtmlExtractorOptions;
}
```

`sourceLang` 与 `defaultLang` 必须出现在 `locales` 中，语言值不能重复。默认语言是 `sourceLang`；若配置 `persist`，已有的有效浏览器偏好优先。

`adapter` 接收完整目录并返回一次性的 `locale → key → string | null` 对象，详见[异步翻译适配器](/ai/ai-translation)。人工 `*.manual.json` 值始终优先。

`framework` 默认由 Vite 插件推断。`autoImport` 默认关闭。`dts` 默认生成 `src/ai-i18n.d.ts`。`directory` 默认配置文件旁的 `i18n/`。`loading` 可控制全局语言资源预加载和预获取；文件范围资源按模块按需加载。

`failOnMissingTranslations` 默认关闭；开启后完整 Build 若有目标语言缺译则失败。`diagnostics.buildSummary` 默认输出覆盖率。`html: false` 可关闭 HTML 显式表达式提取。

`provider`、`remote`、`translationMemory` 和 `cleanup` 已移除。旧配置会在启动时报迁移错误。

配置写在 `ai-i18n.config.ts` 中，Vite 配置仅注册 `aiI18n()`。路径规则见[独立配置与多应用](/guide/basic/configuration)。
