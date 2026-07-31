---
title: i18nComputed()
description: 为纯 Options API 组件提供响应式语言和加载状态
---

`i18nComputed()` 是 Vue 模式专用的 Options API 配置工厂：

```ts
import { i18nComputed } from 'virtual:ai-i18n';
```

它不创建组件，也不要求 `setup()`。把返回值展开到组件的 `computed`，Vue 会为每个组件
实例创建和清理对应的 computed watcher。

## 签名

```ts
function i18nComputed(): {
  currentLang(): string;
  langs(): readonly LangOption[];
  langLoadState(): LangLoadState;
  isLangLoading(): boolean;
  langLoadError(): unknown | null;
};
```

返回值与 [`useI18n()`](./use-i18n) 表示同一份 Runtime 状态，但 Options computed 中读取的是
已经解包的值，不需要 `.value`。

## 基本用法

```vue
<script lang="ts">
import { defineComponent } from 'vue';
import { i18nComputed, setLang } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    ...i18nComputed(),

    currentLanguageLabel() {
      return (
        this.langs.find(({ value }) => value === this.currentLang)?.label ??
        this.currentLang
      );
    },
  },

  watch: {
    currentLang(next: string, previous: string) {
      console.log(previous, '->', next);
    },
  },

  methods: {
    async switchLanguage(event: Event) {
      const target = event.currentTarget;
      if (!(target instanceof HTMLSelectElement)) return;
      await setLang(target.value);
    },
  },
});
</script>

<template>
  <select :value="currentLang" @change="switchLanguage">
    <option v-for="lang in langs" :key="lang.value" :value="lang.value">
      {{ lang.label }}
    </option>
  </select>

  <p>{{ currentLanguageLabel }}</p>
  <p v-if="isLangLoading">正在加载</p>
  <p v-else-if="langLoadState.status === 'error'">语言包加载失败</p>
</template>
```

Options `watch` 由 Vue 管理生命周期，组件卸载时会自动清理。组件外的长期监听仍使用
[`subscribe()`](../functions/subscribe)。

## TypeScript 与 IDE 提示

TypeScript 组件应使用 `defineComponent()`，并在 `tsconfig.json` 中启用 `strict` 或至少启用
`noImplicitThis`。这样 IDE 才能推断 `this.currentLang`、`this.langs`、methods 和 watch 中
的组件实例类型。Vue 自身的 Options `watch` 类型不会根据被监听的 key 推断回调参数，
因此 TypeScript 下应像上例一样显式标注 `next` 和 `previous`。

开启 `autoImport: true` 后可以省略 ai-i18n import；生成的 `ai-i18n.d.ts` 会同时声明
`i18nComputed`。`defineComponent` 仍需从 Vue 导入。

## 同名 computed

展开后声明的同名字段会覆盖默认 getter：

```ts
computed: {
  ...i18nComputed(),
  currentLang() {
    return 'custom';
  },
},
```

除非组件确实需要替换产品语义，否则不要覆盖这些字段。

`langLoadError` 保留 loader reject 的原始值。判断加载是否失败时，以
`langLoadState.status === 'error'` 为准；展示前应转换为应用自己的用户文案。
