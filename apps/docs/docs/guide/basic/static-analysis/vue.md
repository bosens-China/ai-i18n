---
title: Vue 文案写法
description: 在 Vue SFC、Options API 和 template 中直接使用 t()
---

本页只介绍 Vue 特有写法。参数、文案树和宏的通用规则见[通用文案写法](./common)。

## 支持的源码

Vue 模式分析 `.js`、`.mjs`、`.ts`、`.mts`、`.jsx`、`.tsx` 与 `.vue` 源码。JavaScript
与 TypeScript 模块必须使用 ESM，不支持 `.cjs`、`.cts` 或 CommonJS 调用方式。JSX/TSX
项目需要使用 `@vitejs/plugin-vue-jsx`。

Vue SFC 会分析 `<script>`、`<script setup>` 和 template 表达式。模板中的 `v-for`
局部变量、slot 局部变量与组件自身同名 binding 会保留各自作用域，不会误判为翻译 API。

## 直接使用 `t`

自动导入默认关闭。此时新组件推荐在 `<script setup lang="ts">` 顶层显式导入 `t`。顶层
import 会自然成为 template binding，Volar 与 `vue-tsc` 也能直接识别：

```vue
<script setup lang="ts">
import { t } from 'virtual:ai-i18n';
</script>

<template>
  <button>{{ t('保存') }}</button>
</template>
```

普通 Options API 也调用同一个顶层 `t`：

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
    // 让 Vue template 与 Volar 都获得真实的组件 binding。
    t,
    notify() {
      return t('保存成功');
    },
  },
});
</script>

<template>
  <button :title="label" @click="notify">{{ t('保存') }}</button>
</template>
```

普通 Options 的 import 不会自动成为组件实例属性，因此 template 要直接写 `t()` 时，需要
像上例一样把它暴露为 `methods: { t }`。这是一个真实的 Vue method，不使用
`globalProperties`。脚本内仍直接调用词法作用域中的 `t()`，不要改写成 `this.t()`。

`useI18n().t` 与顶层导出的 `t` 是同一个函数。它们都读取 Vue adapter 维护的共享
revision；template、render 或 computed 执行 `t()` 时，Vue 会收集这项依赖。响应式刷新
不是由每个组件调用 `useI18n()` 后单独订阅得到的。

新代码需要语言状态或 action 时，让 `useI18n()` 只提供这些值即可：

```ts
import { t, useI18n } from 'virtual:ai-i18n';

const { currentLang, isLangLoading, setLang } = useI18n();
```

`useI18n()` 仍返回 `t`，既有解构写法与顶层 import 完全等价，不属于废弃能力。

开启 `autoImport: true` 后，可以删除 `t` 的 import。`<script setup>`、普通 `<script>`、
纯 Options 与只有 template 的 SFC 都可以直接使用裸 `t()`：

```vue
<template>{{ t('保存') }}</template>
```

插件生成的 `ai-i18n.d.ts` 同时声明 script 全局 API 和 Vue template 中的 `t`。因此 Volar
与 `vue-tsc` 能直接识别上面的写法，无需补充 import 或 `methods: { t }`。

template 提取和自动注入目前只覆盖默认 HTML template 与 `lang="html"`。`lang="pug"` 等
预处理模板不会提取或注入裸 `t()`；请在 `<script>` 或 computed 中完成翻译，再让模板读取
结果。

自动导入只处理未绑定的 `t`。模板局部变量以及组件自身的 prop、data、computed、method、
inject 或 setup 返回值具有更高优先级。`this.t`、`this.$t`、mixin 与
`globalProperties` 不属于静态提取写法。

## 显式导入下的 Options bridge

关闭自动导入后，普通 Options `<script>` 的显式 import 不会成为 template binding。
`methods: { t }` bridge 只在分析器能静态证明直接根 Options 时参与提取：Vue SFC 必须直接
导出对象字面量，或把对象字面量直接传给已识别的 `defineComponent()`。

根对象顶层出现任意 spread、`extends` 或 `mixins` 时，分析器会保守禁用这个 template
bridge。即使 Vue 运行时能够合并 method，Volar 也能提供类型，也不能据此判断 `t` 一定来自
ai-i18n。此时 template 中的 `t()` 不会提取；请把 `methods: { t }` 放回直接根 Options，
或者在 computed 中词法调用导入的 `t()`，再让 template 使用 computed 结果。

`useI18n()` 用于读取 `currentLang`、`langs` 和语言包加载状态，也兼容从返回值直接取得
`t`。完整返回值见 [Vue `useI18n()` API](/api/runtime/vue/use-i18n)。

## 响应式翻译 getter

Vue 模式还识别从 `virtual:ai-i18n` 导入的 `tRef`。`tRef` 与 `t` 使用相同的静态参数规则：

```ts
import { tRef } from 'virtual:ai-i18n';

const saveLabel = tRef('保存');
const labels = tRef({ save: '保存', cancel: '取消' });

const messages = defineI18nMessages({ save: '保存' });
const selectedLabel = tRef(messages.save);
```

普通文本、整棵静态文案树，以及宏标记后的文案树成员都可以提取。完整签名和生命周期约束见
[`tRef()` API](/api/runtime/vue/t-ref)。

纯 Options API 使用 `tComputed()`：

```ts
import { defineComponent } from 'vue';
import { i18nComputed, tComputed } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    ...i18nComputed(),
    saveLabel: tComputed('保存'),
    labels: tComputed({ save: '保存', cancel: '取消' }),
  },
});
```

`tComputed()` 返回 Options computed getter，支持与 `tRef()` 相同的静态参数和文案树。
完整签名见 [`tComputed()` API](/api/runtime/vue/t-computed)。

## 提取与响应式刷新

| 写法                                             | 提取 | 语言切换行为                            |
| ------------------------------------------------ | ---- | --------------------------------------- |
| `<script setup>` 中 `const label = t('保存')`    | 是   | setup 快照，不会自动更新                |
| `setup()` 中 `const label = t('保存')`           | 是   | setup 快照，不会自动更新                |
| setup 中 `const label = tRef('保存')`            | 是   | 返回 Ref，语言切换时自动更新            |
| setup 中 `const labels = tRef(messages)`         | 是   | 整棵文案树随语言切换更新                |
| Options `label: tComputed('保存')`               | 是   | 组件 computed 随语言切换更新            |
| Options `labels: tComputed(messages)`            | 是   | 同形文案树随语言切换更新                |
| template、render 或 computed 中直接调用 `t`      | 是   | 追踪 Vue revision 并刷新                |
| 显式 import 后以 `methods: { t }` 暴露 `t`       | 是   | 关闭自动导入时建立真实 template binding |
| 模板或 render 使用 `useI18n()` 返回的 `t`        | 是   | 与顶层 `t` 相同，追踪 revision 并刷新   |
| 普通 `setup()` 返回 `useI18n()` 的 `t` 或对象    | 是   | 与顶层 `t` 相同，追踪 revision 并刷新   |
| Options computed / method 中直接调用 `t`         | 是   | 每次执行时读取当前语言                  |
| `this.t`、`this.$t`、mixin 或 `globalProperties` | 否   | 不属于 ai-i18n binding                  |
| 模板或 render 中直接调用 `tRef()`                | 是   | 每次渲染创建 computed，不支持该用法     |
| data、template 或 render 中调用 `tComputed()`    | 是   | 返回 getter，不支持该用法               |
| 仅有 template 的裸 `t`，且开启自动导入           | 是   | Runtime、Volar 与 `vue-tsc` 均支持      |

`ai-i18n/no-eager-translation` 检查初始化快照。
`ai-i18n/no-unsubscribed-t` 仍会检查 `tRef()` 与 `tComputed()` 的错误使用位置。

事件回调和普通延迟函数可以继续使用顶层 `t`，因为它们会在调用时读取当前语言。完整规则见
[ESLint](/guide/quality/eslint)。
