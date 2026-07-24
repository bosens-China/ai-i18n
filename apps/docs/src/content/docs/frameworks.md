---
title: 框架上手
description: Vanilla、Vue、React 三种互斥模式的接入方式
---

每个 Vite build 只选择一种模式：`vanilla`、`vue` 或 `react`。

插件在 `configResolved` 读取最终插件列表。检测到 `vite:vue` / `vite:vue-jsx` 时使用 Vue，
检测到 `vite:react*` 时使用 React，否则回退到 Vanilla。配置 `framework` 可强制覆盖推断。
同一 build 同时安装 Vue 与 React 的 Vite 插件时，会直接报错。

## Vanilla

默认模式，适合纯 JS/TS 或无框架入口。显式从虚拟模块导入即可：

```ts
import { setLang, t } from 'virtual:ai-i18n';
```

## Vue

```ts
import { aiI18n } from '@boses/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    aiI18n({
      /* 基础配置见快速上手 */
      html: true, // Vue 项目常用选项
    }),
    vue(),
  ],
});
```

组件中使用同一个虚拟模块的 Hook：

```ts
import { useI18n } from 'virtual:ai-i18n';

const { t, setLang, currentLang, langs } = useI18n();
```

Vue 模式支持 `.vue`、JS/TS，以及由 `@vitejs/plugin-vue-jsx` 编译的 JSX/TSX。
SFC 会尊重模板 alias、`v-for` 局部变量，以及 `<script>` 与 `<script setup>` 的隔离。

## React

```ts
import { aiI18n } from '@boses/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [aiI18n({/* 基础配置见快速上手 */}), react()],
});
```

```tsx
import { useI18n } from 'virtual:ai-i18n';

export function App() {
  const { t, setLang, currentLang, langs } = useI18n();
  return <button onClick={() => void setLang('en-US')}>{t('切换语言')}</button>;
}
```

React 模式支持 JS/TS/JSX/TSX。同一个 Vite build 不能混用 Vue 与 React 语法。
微前端场景下，每个子应用应使用自己的 Vite 配置与 ai-i18n 状态。

## 自动导入

若最终插件列表包含 `unplugin-auto-import`，ai-i18n 默认启用按需导入，
此时可直接调用 `useI18n()`。

真正插入 `virtual:ai-i18n` import 的仍是 ai-i18n。
无需把 `useI18n` 再写进 Auto Import 的 `imports`。

- `autoImport: true | false` 可强制覆盖检测结果。
- 默认生成 `src/ai-i18n.d.ts`，声明虚拟模块以及启用按需导入时的全局 API。
  可用 `dts` 修改路径，或设为 `dts: false` 关闭。
- 该文件由插件维护，并带有 noformat、ts-nocheck 与 eslint-disable 标记，请勿手工编辑。

## HTML 提取

`html: true` 启用 HTML 提取。也可传入 `{ attributes: [...] }` 修改属性白名单。

## ESLint（可选）

`@boses/eslint-plugin` 与 Vite 共用分析语义，可提前报告无法静态求值的 `t()` 参数。
ESLint 9 使用 Flat Config；按框架展开 `aiI18n.configs.vanilla`、`.vue` 或 `.react`。
完整示例见 [ESLint 9 配置](./eslint/)。
