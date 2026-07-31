---
title: Vue 常见问题
description: 排查 Vue 模板提取、语言切换更新、自动导入与 tRef 使用问题
---

## 为什么模板里找不到 `t`？

未开启自动导入时，从虚拟模块显式导入：

```vue
<script setup lang="ts">
import { t } from 'virtual:ai-i18n';
</script>

<template>
  <button>{{ t('保存') }}</button>
</template>
```

开启 `autoImport: true` 后，可以只保留 template：

```vue
<template>{{ t('保存') }}</template>
```

插件生成的声明会让 Vue language-tools（Volar）与 `vue-tsc` 识别这个裸 `t`，
无需为了 IDE 添加 import。`<script setup>`、普通 `<script>` 和纯 Options 也可以直接使用。
如果仍提示找不到 `t`，按
[TypeScript 与生成声明](/guide/quality/typescript)检查 Vue 的两份声明文件。

自动导入只处理未绑定的 `t`。模板局部变量和组件自身同名 prop、data、computed、method、
inject 或 setup 返回值会遮挡它。本地 binding 始终优先。

关闭自动导入时，已有普通 `<script>` 或 Options API 组件仍使用同一个顶层 `t`：

```vue
<script lang="ts">
import { defineComponent } from 'vue';
import { t } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    label() {
      return t('保存');
    },
  },
  methods: {
    t,
  },
});
</script>

<template>
  <button :title="label">{{ t('保存') }}</button>
</template>
```

Options 的普通 `<script>` import 只存在于模块作用域，不会像 `<script setup>` 顶层
binding 一样自然暴露给 template，所以显式导入模式需要 `methods: { t }`。开启自动导入后，
应同时删除 `t` import 和这个 method bridge。脚本调用始终直接写 `t()`；`this.t`、
`this.$t`、mixin 与 `globalProperties` 不属于静态提取写法。

## 为什么普通模板文本没有被提取？

ai-i18n 不猜测普通 UI 文本。把需要翻译的文本放入已绑定的 `t()`：

```vue
<template>
  <button>{{ t('保存') }}</button>
</template>
```

支持的静态表达式、文案树与限制见 [Vue 文案写法](/guide/basic/static-analysis/vue)。

## 为什么切换语言后组件没有刷新？

Vue 模式从 `virtual:ai-i18n` 导出的顶层 `t` 会读取 adapter revision。在 template、
render 或 computed 中调用时，Vue 会建立响应式依赖并在语言切换后刷新。

`useI18n()` 返回的 `t` 就是这个顶层函数。Vue adapter 统一维护 revision，不需要每个组件
调用 Composable 来为翻译函数单独订阅。未开启自动导入时显式 import `t`；开启后直接调用
裸 `t()`。需要 `currentLang`、加载状态或 `setLang` 时，再从 `useI18n()` 取得对应的 Ref
和 action。

如果在 setup 中保存了 `const label = t('保存')`，得到的也只是当前快照。直接在模板中调用
`t('保存')`，或使用 Vue-only `const label = tRef('保存')`。`tRef()` 返回只读
ComputedRef，应在 setup 或 composable 中创建一次，不要在模板或 render 函数中调用。

## 为什么脚本中读取 `currentLang` 得到的是 Ref？

Vue 适配器返回只读响应式值。模板会自动解包，`<script setup>` 中请读取
`currentLang.value`。`langs`、`langLoadState`、`isLangLoading` 与 `langLoadError` 采用相同
规则。纯 Options 组件把 [`i18nComputed()`](/api/runtime/vue/i18n-computed) 展开到
`computed` 后，读取的是已经解包的值：

```ts
export default defineComponent({
  computed: {
    ...i18nComputed(),
  },
  watch: {
    currentLang(next: string, previous: string) {
      console.log(previous, '->', next);
    },
  },
});
```

Options API 的组件实例与 watch 参数类型问题见
[TypeScript 与生成声明](/guide/quality/typescript)。

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

## 纯 Options API 如何预声明响应式文案？

使用 [`tComputed()`](/api/runtime/vue/t-computed)，并把返回的 getter 放入 Options
`computed`：

```ts
export default defineComponent({
  computed: {
    saveLabel: tComputed('保存'),
    labels: tComputed({ save: '保存', cancel: '取消' }),
  },
});
```

不要把 `tComputed()` 放入 `data()`，也不要在 template 或 render 中调用。依赖
`this` 的动态插值应写成普通 computed，并在 getter 中调用 `t()`。
