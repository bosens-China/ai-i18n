---
title: TranslationBatch
description: Translator 单次调用接收的语言和消息批次
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationBatch } from '@ai-i18n/vite';
```

## 定义

```ts
interface TranslationBatch {
  locales: readonly string[];
  messages: readonly TranslationMessage[];
}
```

## 字段

| 字段       | 类型                                                                        | 必填 | 作用                         |
| ---------- | --------------------------------------------------------------------------- | ---- | ---------------------------- |
| `locales`  | `readonly string[]`                                                         | 是   | 本批所有消息共同缺失的语言。 |
| `messages` | [`readonly TranslationMessage[]`](/api/vite/interfaces/translation-message) | 是   | 按固定下标排列的消息。       |

Vite 按缺失 locale 集合分组，再根据 `AiI18nProviderOptions.batchLength` 切分批次。
