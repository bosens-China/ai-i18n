---
title: getLang()
description: 返回 Runtime 当前使用的语言
---

从 `virtual:ai-i18n` 导入：

```ts
import { getLang } from 'virtual:ai-i18n';
```

## 签名

```ts
function getLang(): string;
```

## 返回值

返回当前语言的 `value`。

首次加载按“有效持久化值 → `defaultLang`”选择。启用按 locale 分包时，目标语言资源就绪前
暂时返回 `sourceLang`。

`getLang()` 本身不建立框架响应式依赖。Vue 或 React 组件应使用
[`useI18n()`](/api/runtime/framework-api/use-i18n) 返回的 `currentLang`。
