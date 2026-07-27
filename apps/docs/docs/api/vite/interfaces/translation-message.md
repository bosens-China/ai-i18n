---
title: TranslationMessage
description: Translator 接收的单条源文案与语境
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationMessage } from '@ai-i18n/vite';
```

## 定义

```ts
interface TranslationMessage {
  source: string;
  comment?: string;
}
```

## 字段

| 字段      | 类型     | 必填 | 作用                           |
| --------- | -------- | ---- | ------------------------------ |
| `source`  | `string` | 是   | 需要翻译的源文案。             |
| `comment` | `string` | 否   | 用于理解业务语境，不进入译文。 |

Vite 不会把 message ID、文件路径或源码位置交给 Translator。
