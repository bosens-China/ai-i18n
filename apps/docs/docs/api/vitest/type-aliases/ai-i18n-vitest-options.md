---
title: AiI18nVitestOptions
description: aiI18nVitest() 接受的配置子集
---

从 `@ai-i18n/vite/vitest` 导入：

```ts
import type { AiI18nVitestOptions } from '@ai-i18n/vite/vitest';
```

## 定义

```ts
type AiI18nVitestOptions = Pick<
  AiI18nOptions,
  'sourceLang' | 'defaultLang' | 'locales' | 'framework' | 'persist'
>;
```

## 字段

| 字段          | 必填 | 说明                                        |
| ------------- | ---- | ------------------------------------------- |
| `sourceLang`  | 是   | 测试源码使用的语言。                        |
| `locales`     | 是   | Runtime 支持的语言列表。                    |
| `defaultLang` | 否   | 没有有效持久化值时使用的初始语言。          |
| `framework`   | 否   | 覆盖 Vanilla、Vue 或 React 的自动检测结果。 |
| `persist`     | 否   | 测试 Runtime 的 localStorage 语言偏好配置。 |

`html`、`loading`、`cache`、`provider`、`directory`、`dts` 等构建期字段不属于该类型。

完整字段契约见 [`AiI18nOptions`](/api/vite/interfaces/ai-i18n-options)。
