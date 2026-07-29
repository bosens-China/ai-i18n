---
title: tRef()
description: 在 Vue setup 中创建随语言变化更新的只读翻译 Ref
---

`tRef()` 是 Vue 模式专用的语法糖，从 `virtual:ai-i18n` 直接导入：

```ts
import { tRef } from 'virtual:ai-i18n';
```

React 与 Vanilla 模式不导出该 API。`tRef` 也不属于 `useI18n()` 的返回值。

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
```

返回 Vue 的只读 `ComputedRef<string>`。语言或 Runtime 翻译模块更新后，`value` 会重新计算；
tagged template 插值如果是 Vue Ref，也会在 `computed` 内解包并建立依赖。

source 与 options 的静态提取要求和 [`t()`](/api/runtime/functions/t) 相同。

## setup 中的展示值

当脚本逻辑需要复用一个响应式 label 时，可以直接写：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { tRef } from 'virtual:ai-i18n';

const name = ref('Ada');
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

## 与 `t()` 的分工

- 模板或渲染函数当场展示：使用 `useI18n()` 返回的 `t`。
- Vue setup / composable 需要预先声明响应式展示值：使用 `tRef()`。
- 事件、日志或普通工具函数需要即时字符串：使用 `t()`。

不要在 template 或渲染函数中直接调用 `tRef()`：

```vue
<!-- 错误：每次渲染都创建新的 computed -->
<template>{{ tRef('保存') }}</template>
```

应在 setup 中创建一次，再把返回的 Ref 用于模板。对应生命周期问题由
[`ai-i18n/no-unsubscribed-t`](/guide/quality/eslint#no-unsubscribed-t) 提示。
