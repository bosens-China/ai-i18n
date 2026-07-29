---
title: Vue 静态分析
description: Vue SFC、useI18n()、tRef() 与模板表达式的提取和刷新规则
---

本页只介绍 Vue 特有规则。参数静态求值、文案树和宏的通用规则见
[通用静态分析](./common)。

## 支持的源码

Vue 模式分析 JS、TS、JSX、TSX 与 `.vue` 文件。JSX/TSX 项目需要使用
`@vitejs/plugin-vue-jsx`。

Vue SFC 会同时分析 `<script>`、`<script setup>` 和模板表达式。模板中的别名、
`v-for` 局部变量与 slot 局部变量会保留各自作用域，不会把同名函数误判为翻译 API。

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

Vue 模板中的 `t` 必须绑定到 `<script setup>` 中 `useI18n()` 返回的函数。自动导入只省略
`useI18n` 的 import，不会自动合成 Hook 调用。

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

| 写法                                               | 提取 | 语言切换行为                          |
| -------------------------------------------------- | ---- | ------------------------------------- |
| `<script setup>` 中 `const label = t('保存')`      | 是   | setup 快照，不会自动更新              |
| `setup()` 中 `const label = t('保存')`             | 是   | setup 快照，不会自动更新              |
| setup 中 `const label = tRef('保存')`              | 是   | 返回 Ref，Runtime revision 变化后重算 |
| setup 中 `const labels = tRef(messages)`           | 是   | 整棵文案树随 Runtime revision 重算    |
| 模板或 render 使用 Runtime 顶层 `t`                | 是   | 不建立订阅，不会主动触发渲染          |
| 模板或 render 使用 `useI18n()` 返回的 `t`          | 是   | 建立 Vue 订阅并刷新                   |
| 模板或 render 中直接调用 `tRef()`                  | 是   | 每次渲染创建 computed，不支持该用法   |
| 仅有 template 的裸 `t`，没有 `<script setup>` 绑定 | 否   | 不受支持，Vue 可能推迟到运行时报错    |

`ai-i18n/no-eager-translation` 检查初始化快照。
`ai-i18n/no-unsubscribed-t` 检查模板与 render 中无订阅的 Runtime `t`，以及渲染期间调用
`tRef()` 的错误生命周期。`vue-auto-import` preset 还会拒绝没有 `<script setup>` 绑定的
裸模板 `t`。

事件回调和普通延迟函数可以继续使用顶层 `t`，因为它们会在调用时读取当前语言。规则不会追踪
任意跨函数或跨文件数据流，完整边界见 [ESLint](/guide/quality/eslint)。
