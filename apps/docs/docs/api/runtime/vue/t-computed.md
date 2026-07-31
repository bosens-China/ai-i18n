---
title: tComputed()
description: 为纯 Options API 创建响应式翻译 computed getter
---

`tComputed()` 是 Vue 模式专用的 Options API 翻译 getter 工厂：

```ts
import { tComputed } from 'virtual:ai-i18n';
```

它与 [`tRef()`](./t-ref) 支持相同的静态文案输入，但返回 Options `computed` 接受的 getter，
而不是 `ComputedRef`。

## 签名

```ts
function tComputed(source: string, options?: TranslationOptions): () => string;
function tComputed(
  strings: TemplateStringsArray,
  ...values: unknown[]
): () => string;
function tComputed<T extends MessageTree>(
  messages: T,
): () => TranslatedMessageTree<T>;
```

## 基本用法

```vue
<script lang="ts">
import { defineComponent } from 'vue';
import { tComputed } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    saveLabel: tComputed('保存'),
    labels: tComputed({
      save: '保存',
      cancel: '取消',
    }),
  },
});
</script>

<template>
  <button>{{ saveLabel }}</button>
  <button>{{ labels.cancel }}</button>
</template>
```

语言或翻译模块变化后，Vue 会使这些 computed 失效并在下次读取时重新计算。每个组件实例拥有
自己的 computed 缓存。

## 动态组件状态

如果插值依赖 `data`、props 或其他 `this` 属性，直接编写普通 computed，并在 getter 中调用
[`t()`](../functions/t)：

```ts
computed: {
  greeting() {
    return t`你好 ${this.name}`;
  },
},
```

## 使用位置

`tComputed()` 应直接作为 Options computed 的值：

```ts
computed: {
  label: tComputed('保存'),
},
```

不要在 `data()`、template 或 render 函数中调用：

```ts
data() {
  return {
    label: tComputed('保存'), // 得到的是 getter，不是译文
  };
},
```

```vue
<!-- 错误：页面得到的是 getter -->
<template>{{ tComputed('保存') }}</template>
```

setup 和 composable 使用 [`tRef()`](./t-ref)；template、render 或手写 computed getter
当场展示时直接使用 [`t()`](../functions/t)。
