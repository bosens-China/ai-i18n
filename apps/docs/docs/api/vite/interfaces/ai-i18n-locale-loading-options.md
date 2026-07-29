---
title: AiI18nLocaleLoadingOptions
description: 配置目标语言的分包与资源提示
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nLocaleLoadingOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nLocaleLoadingOptions {
  preload?: readonly string[];
  prefetch?: readonly string[];
}
```

## 字段

| 字段       | 类型                | 默认值 | 作用                                     |
| ---------- | ------------------- | ------ | ---------------------------------------- |
| `preload`  | `readonly string[]` | `[]`   | 通过 `modulepreload` 尽早准备语言模块。  |
| `prefetch` | `readonly string[]` | `[]`   | 通过 `prefetch` 提示浏览器低优先级缓存。 |

## 行为

设置 `loading` 后，每个目标 locale 会生成独立 Vite chunk。省略 `loading` 时，插件继续使用
全语言注册模式；`loading: {}` 则会启用分包，并在首次 `setLang()` 时加载目标语言。

列表必须满足以下约束：

- 只能引用 `locales` 中的目标 locale；
- 不能包含 `sourceLang`；
- 同一 locale 不能同时出现在两个列表中；
- 单个列表中的重复值会自动去重。

非 source 的 `defaultLang` 会自动加入 `preload`。相同 locale 的并发调用复用底层加载请求；
不同 locale 的并发切换以最后一次 `setLang()` 调用为准。

## 示例

```ts
aiI18n({
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  locales,
  loading: {
    preload: ['en-US'],
    prefetch: ['ja-JP'],
  },
});
```

完整使用流程见[语言分包与按需加载](/guide/basic/locale-loading)。
