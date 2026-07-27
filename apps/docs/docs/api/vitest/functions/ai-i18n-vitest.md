---
title: aiI18nVitest()
description: 为 Vitest 提供内存 Runtime 与编译宏转换
---

从 `@ai-i18n/vite/vitest` 导入：

```ts
import { aiI18nVitest } from '@ai-i18n/vite/vitest';
```

## 签名

```ts
function aiI18nVitest(options: AiI18nVitestOptions): Plugin;
```

`aiI18nVitest()` 返回一个 Vite 插件。它解析 `virtual:ai-i18n`，并提供只驻留在内存中的测试
Runtime。

## 行为

- 保留生产环境的 `t()`、`setLang()` 与框架 `useI18n()` 契约；
- 消除 `defineI18nMessages()` 编译宏；
- 不提取翻译；
- 不调用 Provider；
- 不读取或写入 `i18n/` 协议文件。

测试 Runtime 没有目标语言译文，因此 `t()` 始终返回 source 文案。

## 示例

```ts
import { aiI18nVitest } from '@ai-i18n/vite/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    aiI18nVitest({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
  ],
});
```

完整配置方式见[测试（Vitest）](/guide/quality/testing)。
