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

`t()` 除了字符串和 tagged template，也可以一次翻译整棵静态文案对象或数组。Vue 模式还
可以直接导入 `tRef`，为 setup 中的字符串或文案树创建响应式翻译 Ref。

## 可用范围

| API                                                                | Vanilla | Vue | React | 自动导入 |
| ------------------------------------------------------------------ | ------- | --- | ----- | -------- |
| [`t()`](/api/runtime/functions/t)                                  | 是      | 是  | 是    | 全部模式 |
| [`setLang()`](/api/runtime/functions/set-lang)                     | 是      | 是  | 是    | 全部模式 |
| [`getLang()`](/api/runtime/functions/get-lang)                     | 是      | 是  | 是    | 全部模式 |
| [`getLangs()`](/api/runtime/functions/get-langs)                   | 是      | 是  | 是    | 全部模式 |
| [`getLangLoadState()`](/api/runtime/functions/get-lang-load-state) | 是      | 是  | 是    | 全部模式 |
| [`subscribe()`](/api/runtime/functions/subscribe)                  | 是      | 是  | 是    | 全部模式 |
| [Vue `useI18n()`](/api/runtime/vue/use-i18n)                       | 否      | 是  | 否    | 仅 Vue   |
| [React `useI18n()`](/api/runtime/react/use-i18n)                   | 否      | 否  | 是    | 仅 React |
| [`tRef()`](/api/runtime/vue/t-ref)                                 | 否      | 是  | 否    | 仅 Vue   |

Vue 与 React 业务组件推荐使用各自的 `useI18n()`，让框架自动响应语言变化。开启自动导入后，
组件外的普通模块也可直接使用全部基础 Runtime API。顶层 `t()`、`getLang()` 和
`getLangLoadState()` 不会建立更新订阅；普通模块应在函数或 getter 中按需调用，避免在模块
初始化时保存不会刷新的快照。

Vue setup 中需要预先声明响应式 label 或文案树时，可使用 `tRef()`；它按输入返回只读
`ComputedRef<string>` 或同形文案树。React 与 Vanilla 不提供该语法糖。

[`defineI18nMessages()`](/api/runtime/macros/define-i18n-messages) 是编译宏，不是 Runtime
导出，因此无需 import。
