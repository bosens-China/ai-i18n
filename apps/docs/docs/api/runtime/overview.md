---
title: Runtime 概览
description: virtual:ai-i18n 的导入方式与框架可用范围
---

Runtime API 从 `virtual:ai-i18n` 导入。显式导入始终可用，不受 `autoImport` 影响。

```ts
import {
  getLang,
  getLangLoadState,
  getLangs,
  setLang,
  subscribe,
  t,
} from 'virtual:ai-i18n';
```

## 可用范围

| API                                                                | Vanilla | Vue | React | 自动导入    |
| ------------------------------------------------------------------ | ------- | --- | ----- | ----------- |
| [`t()`](/api/runtime/functions/t)                                  | 是      | 是  | 是    | 全部模式    |
| [`setLang()`](/api/runtime/functions/set-lang)                     | 是      | 是  | 是    | 仅 Vanilla  |
| [`getLang()`](/api/runtime/functions/get-lang)                     | 是      | 是  | 是    | 仅 Vanilla  |
| [`getLangs()`](/api/runtime/functions/get-langs)                   | 是      | 是  | 是    | 仅 Vanilla  |
| [`getLangLoadState()`](/api/runtime/functions/get-lang-load-state) | 是      | 是  | 是    | 仅 Vanilla  |
| [`subscribe()`](/api/runtime/functions/subscribe)                  | 是      | 是  | 是    | 仅 Vanilla  |
| [`useI18n()`](/api/runtime/framework-api/use-i18n)                 | 否      | 是  | 是    | Vue / React |

Vue 与 React 业务组件推荐使用 `useI18n()`，让框架自动响应语言变化。组件之外仍可显式导入
基础函数。框架模式自动导入的顶层 `t()` 也主要面向不能调用 Hook 的普通模块；组件仅调用
顶层 `t()` 不会建立更新订阅。普通模块也应在函数或 getter 中按需调用，避免在模块初始化时
保存不会刷新的译文快照。

[`defineI18nMessages()`](/api/runtime/macros/define-i18n-messages) 是编译宏，不是 Runtime
导出，因此无需 import。
