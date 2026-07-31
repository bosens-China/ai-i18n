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

`t()` 除了字符串和 tagged template，也可以一次翻译整棵静态文案对象或数组。Vue setup
可以使用 `tRef()` 创建响应式翻译 Ref；纯 Options API 使用 `i18nComputed()` 和
`tComputed()`。

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
| [`i18nComputed()`](/api/runtime/vue/i18n-computed)                 | 否      | 是  | 否    | 仅 Vue   |
| [`tComputed()`](/api/runtime/vue/t-computed)                       | 否      | 是  | 否    | 仅 Vue   |

Vue 业务组件可以在 template、render、computed 与 Options method 中直接调用顶层 `t()`；
Vue 适配器会追踪语言 revision。React 业务组件使用 `useI18n()` 建立订阅。`getLang()` 和
`getLangLoadState()` 仍是调用时快照；普通模块应在函数或 getter 中按需调用，避免在模块
初始化时保存不会刷新的值。

Vue 开启 `autoImport: true` 后，script 与 template 都可以直接使用裸 `t()`，生成声明会提供
IDE 类型。关闭自动导入时，`<script setup>` 的显式 import 会自然暴露给 template；纯
Options 的普通 `<script>` import 如需用于 template，还要通过真实组件 binding 暴露。完整
边界见[自动导入](/guide/basic/auto-import)。

Vue setup 中需要预先声明响应式 label 或文案树时，可使用 `tRef()`；它按输入返回只读
`ComputedRef<string>` 或同形文案树。纯 Options API 把 `i18nComputed()` 展开到组件
`computed`，并用 `tComputed()` 创建相同能力的翻译 getter。React 与 Vanilla 不提供这些
Vue 专用 API。

[`defineI18nMessages()`](/api/runtime/macros/define-i18n-messages) 是编译宏，不是 Runtime
导出，因此无需 import。
