---
title: HtmlExtractorOptions
description: 配置 index.html 中需要提取的属性
---

从 `@ai-i18n/vite` 导入：

```ts
import type { HtmlExtractorOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface HtmlExtractorOptions {
  attributes?: readonly string[];
}
```

## 字段

| 字段         | 类型                | 默认值                                      | 作用                     |
| ------------ | ------------------- | ------------------------------------------- | ------------------------ |
| `attributes` | `readonly string[]` | `alt`、`aria-label`、`placeholder`、`title` | 替换默认属性提取白名单。 |

属性名必须由小写字母开头，后续只能包含小写字母、数字和连词线。重复属性会自动去重。

## 用法

| `AiI18nOptions.html` 写法 | 行为                                      |
| ------------------------- | ----------------------------------------- |
| `false` 或省略            | 不处理 HTML。                             |
| `true`                    | 提取完整的静态 `t()` 文本节点与默认属性。 |
| `{ attributes }`          | 提取完整的静态 `t()`，并替换属性白名单。  |

普通 HTML 文本、混合文本、内联脚本和非白名单属性不会自动翻译。HTML 提取与 `framework` 模式
相互独立。完整写法见[通用文案写法](/guide/basic/static-analysis/common#html)。
