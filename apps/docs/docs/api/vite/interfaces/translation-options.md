---
title: TranslationOptions
description: 为静态文案补充翻译语境
---

该类型从 `@ai-i18n/vite` 导出，并用于 `virtual:ai-i18n` 的 `t()` 签名：

```ts
import type { TranslationOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface TranslationOptions {
  comment?: string;
  scope?: 'file';
}
```

## 字段

| 字段      | 类型     | 必填 | 作用                                   |
| --------- | -------- | ---- | -------------------------------------- |
| `comment` | `string` | 否   | 区分文案的翻译身份。                   |
| `scope`   | `'file'` | 否   | 显式指定当前文件范围；省略时全局共享。 |

`comment` 与 `scope` 必须能在构建期确定。相同原文使用不同 `comment` 时属于不同翻译单元；带 comment 的文案不会回退到不带 comment 的译文。

```ts
t('保存', { comment: '按钮' });
t('保存', { comment: '文件状态' });
```

`scope: 'file'` 先查当前文件，再查相同 comment 的全局译文。`comment` 本身只影响翻译身份，不影响范围或运行时参数。
