---
title: TranslationAdapter
description: Build 和显式扫描时的一次性异步翻译接口
---

```ts
type TranslationAdapter = (
  catalog: TranslationCatalog,
) => Promise<TranslationSnapshot | null>;

interface TranslationCatalog {
  sourceLang: string;
  locales: readonly string[];
  messages: readonly {
    key: string;
    source: string;
    comment?: string;
    scope: 'global' | 'file';
    file?: { id: string; path: string };
  }[];
}

type TranslationSnapshot = Readonly<
  Record<string, Readonly<Record<string, string | null>>>
>;
```

返回 `null` 或省略某个 key 表示不提供该译文。空字符串有效。插件验证语言、key、值类型和模板占位符；人工 `*.manual.json` 值始终优先。适配器结果不由插件持久化。
