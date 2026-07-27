---
title: TranslationResult
description: Translator 为一条消息返回的目标语言矩阵行
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationResult } from '@ai-i18n/vite';
```

## 定义

```ts
type TranslationResult = Readonly<Record<string, string | null>>;
```

键必须与当前 [`TranslationBatch.locales`](/api/vite/interfaces/translation-batch) 完全一致。
非空字符串表示译文，`null` 表示该目标语言仍缺译。

```ts
const result: TranslationResult = {
  'en-US': 'Save',
  'ja-JP': null,
};
```

Translator 返回值中缺少语言键、包含额外键，或使用非字符串且非 `null` 的值时，Vite 会拒绝
该批结果。
