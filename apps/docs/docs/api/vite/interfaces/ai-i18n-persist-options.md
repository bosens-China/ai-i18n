---
title: AiI18nPersistOptions
description: 配置语言偏好的 localStorage key
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nPersistOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nPersistOptions {
  key: string;
}
```

## 字段

| 字段  | 类型     | 必填 | 作用                              |
| ----- | -------- | ---- | --------------------------------- |
| `key` | `string` | 是   | 保存当前语言的 localStorage key。 |

`key` 去除首尾空白后不能为空。

## 用法

[`AiI18nOptions.persist`](/api/vite/interfaces/ai-i18n-options) 支持三种写法：

| 写法                      | 行为                  |
| ------------------------- | --------------------- |
| `false` 或省略            | 不读写 localStorage。 |
| `true`                    | 使用 `ai-i18n:lang`。 |
| `{ key: 'app-language' }` | 使用指定 key。        |

存储不可用或保存值不在 `locales` 中时，Runtime 会忽略该值。
