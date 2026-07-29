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

- 保留生产环境的 `t()`、`setLang()`、`getLangLoadState()`、框架 `useI18n()` 与 Vue-only
  `tRef()` 契约；
- `autoImport: true` 时注入与生产框架模式相同的 Runtime API；
- 消除 `defineI18nMessages()` 编译宏；
- 不提取翻译；
- 不调用 Provider；
- 不读取或写入 `i18n/` 协议文件。

测试 Runtime 没有目标语言译文，因此 `t()` 始终返回 source 文案。
它也不创建语言 chunk loader，因此 `getLangLoadState()` 与 `useI18n()` 的加载状态字段固定
为 `idle`；这里只保留 API 形状，不模拟生产加载失败。

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
