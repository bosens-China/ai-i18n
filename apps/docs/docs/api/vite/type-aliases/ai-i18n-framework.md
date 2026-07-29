---
title: AiI18nFramework
description: ai-i18n 支持的 Vite 框架模式
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nFramework } from '@ai-i18n/vite';
```

## 定义

```ts
type AiI18nFramework = 'vanilla' | 'vue' | 'react';
```

## 值

| 值          | 行为                                                    |
| ----------- | ------------------------------------------------------- |
| `'vanilla'` | 提供基础 Runtime API，不生成 `useI18n()`。              |
| `'vue'`     | 为 `virtual:ai-i18n` 增加 Vue `useI18n()` 与 `tRef()`。 |
| `'react'`   | 为 `virtual:ai-i18n` 增加 React `useI18n()`。           |

省略 [`AiI18nOptions.framework`](/api/vite/interfaces/ai-i18n-options) 时，插件根据最终 Vite
插件列表自动检测。一个 build 同时包含 Vue 与 React 插件时会报错。
