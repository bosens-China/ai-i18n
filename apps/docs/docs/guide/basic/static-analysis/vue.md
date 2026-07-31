---
title: Vue 文案写法
description: 在 Vue SFC 中使用 useI18n() 和 tRef() 翻译并更新文案
---

本页只介绍 Vue 特有写法。参数、文案树和宏的通用规则见[通用文案写法](./common)。

## 支持的源码

Vue 模式分析 `.js`、`.mjs`、`.ts`、`.mts`、`.jsx`、`.tsx` 与 `.vue` 源码。JavaScript
与 TypeScript 模块必须使用 ESM，不支持 `.cjs`、`.cts` 或 CommonJS 调用方式。JSX/TSX
项目需要使用 `@vitejs/plugin-vue-jsx`。

Vue SFC 会分析 `<script>`、`<script setup>` 和可确认 ai-i18n binding 的模板表达式。
模板中的别名、`v-for` 局部变量与 slot 局部变量会保留各自作用域，不会把同名函数误判为
翻译 API。

## `useI18n()` 返回的 `t`

分析器识别直接从 `useI18n()` 返回值获得的 `t`，包括解构改名和对象成员调用：

```ts
const { t: translate } = useI18n();
const i18n = useI18n();

translate('保存');
i18n.t('取消');
i18n['t']('返回');
```

从 `useI18n()` 返回值二次解构，或直接调用 `useI18n().t()`，不在推荐范围内：

```ts
const i18n = useI18n();
const { t } = i18n; // 不支持二次解构

useI18n().t('保存'); // 不支持链式调用
```

Vue 模板中的 `t` 可以来自 `<script setup>`，也可以由普通 `<script>` 组件的 `setup()`
直接返回。普通脚本支持解构改名、可静态追踪的 `const` 别名，以及返回 i18n 对象后在模板
调用 `.t`：

```vue
<script lang="ts">
import { useI18n } from 'virtual:ai-i18n';

export default {
  setup() {
    const { t: translate } = useI18n();
    const i18n = useI18n();
    return { translate, i18n };
  },
};
</script>

<template>
  <button>{{ translate('保存') }}</button>
  <button>{{ i18n.t('取消') }}</button>
</template>
```

普通脚本只识别能静态证明来自 `useI18n()`，且由 `setup()` 中唯一的顶层
`return { ... }` 直接暴露的 binding。条件或多分支 return、`this.t`、`this.$t`、mixin、
`globalProperties` 和任意同名 Options API method 不会提取。返回对象含 spread、计算属性、
重复键，或 setup 改写了 i18n 对象的 `.t` 时也会保守跳过。自动导入只省略 `useI18n` 的
import，不会自动合成 Hook 调用。

完整返回值见 [Vue `useI18n()` API](/api/runtime/vue/use-i18n)。

## `tRef()`

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

## 提取与响应式刷新

| 写法                                                  | 提取 | 语言切换行为                        |
| ----------------------------------------------------- | ---- | ----------------------------------- |
| `<script setup>` 中 `const label = t('保存')`         | 是   | setup 快照，不会自动更新            |
| `setup()` 中 `const label = t('保存')`                | 是   | setup 快照，不会自动更新            |
| setup 中 `const label = tRef('保存')`                 | 是   | 返回 Ref，语言切换时自动更新        |
| setup 中 `const labels = tRef(messages)`              | 是   | 整棵文案树随语言切换更新            |
| `<script setup>` 模板或 render 使用顶层 `t`           | 是   | 不建立订阅，不会主动触发渲染        |
| 模板或 render 使用 `useI18n()` 返回的 `t`             | 是   | 建立 Vue 订阅并刷新                 |
| 普通 `setup()` 直接返回 `useI18n()` 的 `t` 或对象     | 是   | 建立 Vue 订阅并刷新                 |
| Options method、`this.t`、mixin 或 `globalProperties` | 否   | 不属于 ai-i18n binding              |
| 模板或 render 中直接调用 `tRef()`                     | 是   | 每次渲染创建 computed，不支持该用法 |
| 仅有 template 的裸 `t`，没有脚本 binding              | 否   | 不受支持，Vue 可能推迟到运行时报错  |

`ai-i18n/no-eager-translation` 检查初始化快照。
`ai-i18n/no-unsubscribed-t` 检查模板与 render 中未订阅的顶层 `t`，以及渲染期间调用
`tRef()` 的错误生命周期。`vue-auto-import` preset 还会拒绝没有脚本 binding 的
template-only 裸 `t`。

事件回调和普通延迟函数可以继续使用顶层 `t`，因为它们会在调用时读取当前语言。完整规则见
[ESLint](/guide/quality/eslint)。
