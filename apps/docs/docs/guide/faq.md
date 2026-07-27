---
title: 常见问题
description: ai-i18n 的安装兼容性、静态提取、自动导入、语言切换与生成文件排查
---

## Vite 7 或更低版本能否使用？

不能。ai-i18n 当前要求 Vite ≥ 8。使用更低版本时，请先升级 Vite，并确认当前 Node.js
版本满足 Vite 8 的运行要求。

## 是否支持 SSR？

当前 Runtime 仅支持浏览器端。SSR 阶段会跳过翻译提取、模块注册和 Runtime 注入，并输出
warning；`defineI18nMessages()` 的编译期消除仍会执行。

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
   `getLangs`、`subscribe`；Vue 和 React 自动导入 `useI18n`。
3. 修改 Vite 配置后重启开发服务器。
4. TypeScript 项目启动一次 Vite，确认生成的 `src/ai-i18n.d.ts` 位于 `tsconfig.json`
   的 `include` 范围内。
5. ESLint 项目使用与框架匹配的 `configs.vanilla`、`configs.vue` 或 `configs.react`。

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

## 为什么切换语言后仍然显示源文案？

缺失翻译或值为 `null` 时，Runtime 固定回退到 source。检查
`i18n/translations.json` 或 `i18n/overrides.json` 中是否存在目标 locale 的有效译文，并让
运行中的 Vite Dev 自动同步，或重新执行一次 Vite Build。

你可以使用 [AI 翻译](/guide/advanced/ai-translation) 配置 Provider，也可以通过
[接入 Agent](/guide/advanced/ai-tools) 补齐缺失翻译。四类协议文件的职责见
[目录说明](/guide/basic/directory)。

## 为什么按需加载语言包时切换失败？

配置 `loading` 后，未加载的目标语言会在 `setLang()` 时请求独立 chunk。加载失败时，
Promise 会 reject，并保留当前语言。应用应捕获错误并提供重试入口。

同时确认 `preload` 和 `prefetch` 只包含已配置的目标 locale，未包含 `sourceLang`，并且
同一 locale 没有同时出现在两个列表中。完整示例见
[语言分包与按需加载](/guide/basic/locale-loading)。

## 生成文件是否需要提交？

需要。源码变更与以下文件应在同一个 PR 中提交：

- `src/ai-i18n.d.ts`，或通过 `dts` 设置的自定义声明路径；
- `i18n/translations.json`；
- `i18n/overrides.json`；
- `i18n/extracted/*.json`；
- `i18n/locales/**`。

这样可以让源码结构、Translation Memory、人工覆盖和最终 Runtime 文案保持一致。
