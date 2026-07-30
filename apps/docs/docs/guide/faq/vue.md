---
title: Vue 常见问题
description: 排查 Vue 模板提取、语言切换更新、自动导入与 tRef 使用问题
---

## 为什么模板里找不到 `t`？

模板必须使用 `<script setup>` 中 `useI18n()` 返回的 `t`：

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { t } = useI18n();
</script>

<template>
  <button>{{ t('保存') }}</button>
</template>
```

`autoImport: true` 只省略 import，不会自动执行 composable。自动导入模式仍需保留
`const { t } = useI18n()`。

## 为什么普通模板文本没有被提取？

ai-i18n 不猜测普通 UI 文本。把需要翻译的文本放入已绑定的 `t()`：

```vue
<template>
  <button>{{ t('保存') }}</button>
</template>
```

支持的静态表达式、文案树与限制见 [Vue 文案写法](/guide/basic/static-analysis/vue)。

## 为什么切换语言后组件没有刷新？

组件渲染必须调用 `useI18n()` 返回的 `t`。从 `virtual:ai-i18n` 单独导入的顶层 `t` 只读取
当前语言，不会让组件订阅后续更新。

如果在 setup 中保存了 `const label = t('保存')`，得到的也只是当前快照。直接在模板中调用
`t('保存')`，或使用 Vue-only `const label = tRef('保存')`。`tRef()` 返回只读
ComputedRef，应在 setup 或 composable 中创建一次，不要在模板或 render 函数中调用。

## 为什么脚本中读取 `currentLang` 得到的是 Ref？

Vue 适配器返回只读响应式值。模板会自动解包，`<script setup>` 中请读取
`currentLang.value`。`langs`、`langLoadState`、`isLangLoading` 与 `langLoadError` 采用相同
规则。

## Pinia 或普通 TS 文件能否直接使用语言 API？

可以。Vue 模式的 `autoImport: true` 同时提供 `setLang()`、`getLang()`、`getLangs()`、
`getLangLoadState()` 与 `subscribe()`。Pinia action、路由守卫和普通工具函数可以直接调用。

`getLang()` 与 `getLangLoadState()` 返回调用时快照，不是 Ref。Store 要长期暴露响应式语言
状态时，使用 `useI18n()` 返回的只读 Ref，或通过 `subscribe()` 同步并在销毁时取消订阅。

## `tRef()` 是否来自 `useI18n()`？

不是。`tRef` 是 Vue 模式下由 `virtual:ai-i18n` 独立导出的 API：

```vue
<script setup lang="ts">
import { tRef } from 'virtual:ai-i18n';

const label = tRef('保存');
</script>

<template>{{ label }}</template>
```

需要完整签名和文案树示例时，查看 [`tRef()` API](/api/runtime/vue/t-ref)。
