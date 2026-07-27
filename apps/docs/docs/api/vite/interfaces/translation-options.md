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
}
```

## 字段

| 字段      | 类型     | 必填 | 作用                         |
| --------- | -------- | ---- | ---------------------------- |
| `comment` | `string` | 否   | 向翻译器说明文案的业务语境。 |

`comment` 必须能在构建期静态求值。ai-i18n 会去除首尾空白，再用它参与 message ID 计算。

```ts
t('保存', { comment: '按钮' });
t('保存', { comment: '文件状态' });
```

模型只翻译 source，comment 只用于理解语境，不会进入最终译文。
