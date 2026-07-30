---
title: tRef()
description: 在 Vue setup 中创建随语言变化更新的只读翻译 Ref
---

`tRef()` 是 Vue 模式专用的语法糖，从 `virtual:ai-i18n` 直接导入：

```ts
import { tRef } from 'virtual:ai-i18n';
```

`tRef` 不属于 `useI18n()` 的返回值。

## 签名

```ts
function tRef(
  source: string,
  options?: TranslationOptions,
): ComputedRef<string>;
function tRef(
  strings: TemplateStringsArray,
  ...values: unknown[]
): ComputedRef<string>;
function tRef<T extends MessageTree>(
  messages: T,
): ComputedRef<TranslatedMessageTree<T>>;
```

字符串输入返回 Vue 的只读 `ComputedRef<string>`；文案树输入返回保持原结构的
`ComputedRef<TranslatedMessageTree<T>>`。语言或 Runtime 翻译模块更新后，`value` 会重新
计算；tagged template 插值如果是 Vue Ref，也会在 `computed` 内解包并建立依赖。

source 与 options 的静态提取要求和 [`t()`](/api/runtime/functions/t) 相同。除普通文本和
整棵文案树外，也可以把 `defineI18nMessages()` 标记后的成员传给 `tRef()`：

```ts
const messages = defineI18nMessages({
  actions: { save: '保存', cancel: '取消' },
});

const saveLabel = tRef(messages.actions.save);
```

`defineI18nMessages()` 是编译宏，无需 import；只有按属性或索引选择单条文案时才需要它。

## setup 中的展示值

当脚本逻辑需要复用一个响应式 label 时，可以直接写：

```vue
<script setup lang="ts">
import { shallowRef } from 'vue';
import { tRef } from 'virtual:ai-i18n';

const name = shallowRef('Ada');
const saveLabel = tRef('保存');
const greeting = tRef`你好 ${name}`;

function submit() {
  console.log(saveLabel.value);
}
</script>

<template>
  <button>{{ saveLabel }}</button>
  <p>{{ greeting }}</p>
</template>
```

在脚本中读取 `.value`；模板会自动解包 Ref。

## 响应式对象与数组

需要在 setup 中复用一组会随语言切换更新的文案时，可以直接把静态文案树交给 `tRef()`：

```vue
<script setup lang="ts">
import { tRef } from 'virtual:ai-i18n';
import { messages } from './messages';

const labels = tRef(messages);
</script>

<template>
  <button>{{ labels.actions.save }}</button>
  <span>{{ labels.states[0] }}</span>
</template>
```

静态本地对象和导入对象都支持，不要求 `as const` 或 `defineI18nMessages()`。每个字符串叶子
都会翻译，其他基础类型原样保留。输入必须是纯文案的普通对象或数组；不支持 `Map`、`Set`、
函数、循环引用、getter、运行时生成的集合，也不能为单个叶子设置 `comment` 或插值。

## 与 `t()` 的分工

- 模板或渲染函数当场展示：使用 [`useI18n()`](./use-i18n) 返回的 `t`。
- Vue setup / composable 需要预先声明响应式字符串、对象或数组：使用 `tRef()`。
- 事件、日志或普通工具函数需要即时字符串：使用 `t()`。

不要在 template 或渲染函数中直接调用 `tRef()`：

```vue
<!-- 错误：每次渲染都创建新的 computed -->
<template>{{ tRef('保存') }}</template>
```

应在 setup 中创建一次，再把返回的 Ref 用于模板。对应生命周期问题由
[`ai-i18n/no-unsubscribed-t`](/guide/quality/eslint#no-unsubscribed-t) 提示。静态提取规则见
[Vue 文案写法](/guide/basic/static-analysis/vue)。
