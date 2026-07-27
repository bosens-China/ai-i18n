---
title: Translator
description: ai-i18n 的自定义翻译函数契约
---

从 `@ai-i18n/vite` 导入：

```ts
import type { Translator } from '@ai-i18n/vite';
```

## 定义

```ts
type Translator = (
  batch: TranslationBatch,
) => Promise<readonly TranslationResult[]>;
```

## 契约

Translator 返回的数组必须与 `batch.messages` 等长。每一行必须且只能包含
`batch.locales` 中的语言键，值为译文或 `null`。输入和输出通过数组下标对应，不需要返回
message ID。

## 示例

```ts
import type { Translator } from '@ai-i18n/vite';

export const translator: Translator = async ({ locales, messages }) =>
  messages.map((message) =>
    Object.fromEntries(
      locales.map((locale) => [locale, translate(locale, message.source)]),
    ),
  );
```

实现 Translator 时必须自行处理鉴权、超时和供应商返回值，再按上述契约返回结果。

相关类型：

- [`TranslationBatch`](/api/vite/interfaces/translation-batch)
- [`TranslationMessage`](/api/vite/interfaces/translation-message)
- [`TranslationResult`](/api/vite/type-aliases/translation-result)
