---
title: LangOption
description: 描述语言标识和展示名称
---

从 `@ai-i18n/vite` 导入：

```ts
import type { LangOption } from '@ai-i18n/vite';
```

## 定义

```ts
interface LangOption {
  value: string;
  label: string;
}
```

## 字段

| 字段    | 类型     | 必填 | 作用                                          |
| ------- | -------- | ---- | --------------------------------------------- |
| `value` | `string` | 是   | 语言标识，用于 `setLang()` 和目标语言文件名。 |
| `label` | `string` | 是   | 面向用户的语言名称，由 `getLangs()` 返回。    |

`AiI18nOptions.locales` 至少包含一项，且所有 `value` 必须唯一。

```ts
const locales: readonly LangOption[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];
```
