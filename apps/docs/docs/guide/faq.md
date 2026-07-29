---
title: 常见问题
description: ai-i18n 的安装兼容性、静态提取、自动导入、语言切换与生成文件排查
---

## Vite 7 或更低版本能否使用？

不能。ai-i18n 当前要求 Vite ≥ 8。使用更低版本时，请先升级 Vite，并确认当前 Node.js
版本满足 Vite 8 的运行要求。

## 为什么会安装 fs-native-extensions？

`@ai-i18n/vite` 通过 `@ai-i18n/core` 依赖 `fs-native-extensions`。Vite 与
`@ai-i18n/mcp` 可能同时修改 `translations.json` 或 `overrides.json`，因此需要跨进程文件锁，
把“读取 → 修改 → 原子写入”整体串行化。否则，两个进程同时读写时，后完成的进程可能覆盖
另一个进程的修改。

原子写入只能避免文件写到一半时损坏，无法避免并发读改写造成的数据丢失。Node.js 的
`node:fs` 目前也没有跨平台的 `flock` 等价 API，因此 ai-i18n 使用
`fs-native-extensions` 提供操作系统级文件锁。该依赖只在 Vite 和 MCP 的 Node.js 进程中
运行，不会进入浏览器产物。

当前发布包没有提供 Linux musl 预编译产物。使用 `node:24-alpine` 等 Alpine 构建镜像时，
可能出现包含 `ADDON_NOT_FOUND` 或 `linux-x64-musl` 的错误。请把 Node.js 构建阶段改为
glibc 镜像，例如 `node:24-bookworm-slim`。最终用于托管静态文件的 Nginx 阶段仍可继续
使用 Alpine。

## 是否支持 SSR？

当前 Runtime 仅支持浏览器端。SSR 阶段会跳过翻译提取、模块注册和 Runtime 注入，并输出
警告；`defineI18nMessages()` 的编译期消除仍会执行。

如果项目需要服务端渲染译文、按请求选择 locale 或避免首屏 source fallback，当前版本
无法提供完整支持。

## 是否需要安装 unplugin-auto-import？

不需要。ai-i18n 的自动导入是插件自身能力，安装 `unplugin-auto-import` 不会自动启用它。
如果项目因为其他 API 使用了 `unplugin-auto-import`，两者可以同时存在，但不要在
`unplugin-auto-import` 中重复配置 ai-i18n Runtime API。

需要省略显式 import 时，请在 `aiI18n()` 中设置 `autoImport: true`，详见
[自动导入](/guide/basic/auto-import)。

## 为什么自动导入没有生效？

按顺序检查：

1. 确认 `aiI18n({ autoImport: true })` 已显式开启。其他 Vite 插件不会改变该选项。
2. 确认使用了当前框架模式支持的 API：Vanilla 自动导入 `t`、`setLang`、`getLang`、
   `getLangs`、`getLangLoadState`、`subscribe`；Vue 自动导入 `useI18n`、`t` 与 `tRef`，
   React 自动导入 `useI18n` 与 `t`。
3. 修改 Vite 配置后重启开发服务器。
4. TypeScript 项目启动一次 Vite，确认生成的 `src/ai-i18n.d.ts` 位于 `tsconfig.json`
   的 `include` 范围内。
5. ESLint 项目使用与框架匹配的 `configs['vanilla-auto-import']`、
   `configs['vue-auto-import']` 或 `configs['react-auto-import']`。

局部变量、函数参数或显式 import 与自动导入 API 同名时，局部 binding 始终优先。

## 为什么普通 JSX 或 Vue 模板文本没有被提取？

ai-i18n 不猜测普通 UI 文本，只提取明确调用翻译 API 的内容：

```tsx
<button>{t('保存')}</button>
```

普通 JSX 文本、Vue 模板文本和 JavaScript 字符串都不会自动进入翻译文件。支持的调用来源、
参数写法与 HTML 范围见 [静态分析范围](/guide/basic/static-analysis)。

## 为什么 Dev 没有提取某个页面？

Vite Dev 只分析浏览器实际请求到的模块。懒路由尚未访问时，对应模块不会进入当前提取结果。
先访问目标页面，再检查 `extracted/*.json`。

需要确认生产入口的完整覆盖范围时，运行一次 `vite build`。Build 只分析从入口可达的模块，
不会扫描未被项目引用的文件。

## 为什么切换语言后组件没有刷新？

先检查组件是否从 `useI18n()` 获取 `t`。从 `virtual:ai-i18n` 导入或自动注入的 Runtime
顶层 `t` 只读取当前语言，不会让 Vue / React 组件订阅后续变化。

Vue 可以在 `<script setup>` 中解构 `t`，再在模板中调用：

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { t } = useI18n();
</script>

<template>
  <button>{{ t('保存') }}</button>
</template>
```

解构不会破坏响应性。模板渲染时调用 `t()` 会读取 Vue 适配器内部的 Runtime revision；
语言、加载状态或翻译模块更新后，模板会重新渲染。

React 同样需要在组件中调用 Hook：

```tsx
import { useI18n } from 'virtual:ai-i18n';

function SaveButton() {
  const { t } = useI18n();
  return <button>{t('保存')}</button>;
}
```

Vanilla JS 没有框架渲染周期，需要主动订阅并重新渲染：

```js
import { subscribe, t } from 'virtual:ai-i18n';

function render() {
  document.querySelector('#save').textContent = t('保存');
}

render();
const unsubscribe = subscribe(render);

// 页面或视图销毁时调用 unsubscribe()。
```

再检查是否在模块初始化或 Vue setup 期间保存过译后字符串。`const label = t('保存')`
只是当时的快照；普通工具模块改成 `const getLabel = () => t('保存')`，Vue setup 展示值可
直接写 `const label = tRef('保存')`。对象或数组可写成 `const labels = tRef(messages)`，
整棵文案树会随语言变化重算。`tRef` 只在 Vue 模式导出，并返回只读计算属性；模板直接使用
返回值，不要在模板中调用 `tRef()`。React 不要把结果预先放入 state 或模块常量。React Compiler
可能继续复用无订阅渲染的旧结果，不能替代 `useI18n()`。

启用对应的 ESLint preset 后，`no-eager-translation` 和 `no-unsubscribed-t` 会提示这些
可以确定的常见问题。规则不追踪任意跨函数或跨文件数据流，详情见
[ESLint](/guide/quality/eslint)。

## 为什么切换语言后仍然显示源文案？

缺失翻译或值为 `null` 时，Runtime 固定回退到 source。检查
`i18n/translations.json` 或 `i18n/overrides.json` 中是否存在目标 locale 的有效译文，并让
运行中的 Vite Dev 自动同步，或重新执行一次 Vite Build。

你可以使用 [AI 翻译](/guide/advanced/ai-translation) 配置 Provider，也可以通过
[接入 Agent](/guide/advanced/ai-tools) 补齐缺失翻译。四类协议文件的职责见
[目录说明](/guide/basic/directory)。

## 为什么按需加载语言包时切换失败？

配置 `loading` 后，未加载的目标语言会在 `setLang()` 时请求独立 chunk。加载失败时，
Promise 会 reject，并保留当前语言。Vue / React 组件可以直接使用 `useI18n()` 返回的
`isLangLoading` 和 `langLoadState.status === 'error'` 显示通用状态；需要业务级恢复动作
时，仍可捕获 Promise 并提供重试入口。

同时确认 `preload` 和 `prefetch` 只包含已配置的目标 locale，未包含 `sourceLang`，并且
同一 locale 没有同时出现在两个列表中。完整示例见
[语言分包与按需加载](/guide/basic/locale-loading)。

## 生成文件是否需要提交？

只提交包含权威数据或开发声明的文件。源码变更与以下文件应在同一个 PR 中提交：

- `src/ai-i18n.d.ts`，或通过 `dts` 设置的自定义声明路径；
- `i18n/translations.json`；
- `i18n/overrides.json`。

`i18n/extracted/` 与 `i18n/locales/` 是 Build 可重新生成的本地产物，应加入
`.gitignore`。首次调用 MCP、`extracted/` 缺失或为空，或者切换分支和修改提取相关配置后，
先运行目标应用的一次完整 Build。Dev 只提取浏览器实际访问过的模块。
