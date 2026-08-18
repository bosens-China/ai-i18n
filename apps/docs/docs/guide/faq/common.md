---
title: 通用常见问题
description: 排查 ai-i18n 的安装兼容性、SSR、Dev 提取、语言加载与生成文件问题
---

Vue 模板、响应式更新和 `tRef()` 问题见 [Vue 常见问题](/guide/faq/vue)。React JSX、组件订阅
和 React Compiler 问题见 [React 常见问题](/guide/faq/react)。

## Vite 7 或更低版本能否使用？

不能。ai-i18n 当前要求 Vite ≥ 8。使用更低版本时，请先升级 Vite，并确认当前 Node.js
版本满足 Vite 8 的运行要求。

## 为什么会安装 fs-native-extensions？

`@ai-i18n/vite` 通过 `@ai-i18n/core` 依赖 `fs-native-extensions`。Vite 与
`@ai-i18n/mcp` 可能同时修改分片 JSON Translation Memory 或 `overrides.json`，因此需要跨进程文件锁，
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
如果项目因为其他 API 使用了 `unplugin-auto-import`，两者可以同时存在，但不要重复配置
ai-i18n Runtime API。

需要省略显式 import 时，请设置 `aiI18n({ autoImport: true })`。完整边界见
[自动导入](/guide/basic/auto-import)。

## 为什么自动导入没有生效？

按顺序检查：

1. 确认 `aiI18n({ autoImport: true })` 已显式开启。
2. 确认使用了当前模式支持的 API：三种模式都提供 `t`、语言 API 和 `subscribe`；Vue
   额外提供 `useI18n`、`tRef`、`i18nComputed` 与 `tComputed`，React 额外提供
   `useI18n`。
3. 修改 Vite 配置后重启开发服务器。
4. TypeScript 或 Vue template 报未定义时，按
   [TypeScript 与生成声明](/guide/quality/typescript)确认生成文件。
5. ESLint 项目使用与框架匹配的 `vanilla-auto-import`、`vue-auto-import` 或
   `react-auto-import` preset。

局部变量、函数参数或显式 import 与自动导入 API 同名时，本地 binding 始终优先。Vue
template 可以直接使用未绑定的 `t()`；组件自身同名 binding 会遮挡自动导入。详见
[Vue 常见问题](/guide/faq/vue)。

## 为什么 Dev 没有提取某个页面？

Vite Dev 只分析浏览器实际请求到的模块。懒路由尚未访问时，对应模块不会进入当前提取结果。
先访问目标页面，再检查 `extracted/*.json`。

需要确认生产入口的完整覆盖范围时，运行一次 `vite build`。Build 只分析从入口可达的模块，
不会扫描未被项目引用的文件。

## 为什么源码中的 `t()` 没有被提取，但调整 Vite 插件顺序后恢复了？

Vite 插件会按顺序转换模块。ai-i18n 已经运行在 `pre` 阶段，通常会早于 Vue、React 等普通
转换；但另一个同为 `pre` 的插件仍可能先替换宏或改写源码，使 ai-i18n 只能看到转换后的结果。

按以下顺序排查：

1. 运行一次完整 `vite build`，确认目标模块可从应用入口到达。Dev 未访问的懒路由不会参与处理。
2. 确认这段文案确实应由 ai-i18n 的 `t()` 翻译，而不是由另一个构建期宏自行处理。
3. 临时禁用可能改写源码的前置插件并重新 Build。提取恢复时，说明该插件在 ai-i18n 之前移除了
   调用。
4. 如果 `t()` 确实属于 ai-i18n，把 `aiI18n()` 放在同阶段的源码改写插件之前，再检查两者是否
   设置了更细的 hook 顺序。修改后重启 Dev 或重新 Build。

不要为了让 ai-i18n 提取而给其他插件拥有的宏字段添加 `t()`。例如权限插件本来就会翻译页面标题时，
应保持它要求的静态值：

```ts
definePagePermissions({
  title: '详情',
});
```

此时标题没有进入 ai-i18n 的提取结果是正常行为，不需要调整插件顺序，也不需要声明宏白名单。

## 为什么首次打开页面或懒路由很慢？

浏览器显示 `304 Not Modified` 只表示缓存校验成功，不能单独说明耗时发生在网络或 ai-i18n。
需要区分源码转换和协议写入时，可临时开启 Dev 阶段耗时诊断：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  diagnostics: {
    timing: { minDurationMs: 20 },
  },
});
```

终端只输出达到阈值的阶段和相对 Vite root 的模块 ID。`timing: true` 使用 50ms 默认阈值；
该功能默认关闭且仅在 Vite Dev 生效。总阶段还会细分为以下子阶段：

先按最慢阶段定位：

- `source-transform`：完整源码转换。继续查看 `plugin-ready-wait`、`source-analysis`、
  `source-registration`、`dependency-resolution` 和 `state-transaction`，判断慢在初始化等待、
  单文件分析、依赖解析还是内存状态更新。`dependency-resolution` 还可能包含 Vite 加载并转换
  尚未分析子模块的等待，不能把它全部当作插件自身的解析计算。
- `file-sync`：一批 Dev 变化的后台持久化。继续查看 `snapshot-build`、`extracted-scan`、
  `translation-memory-sync`、`extracted-write` 和 `locale-write`，判断慢在快照、存储事务还是文件写入。

总阶段包含相应子阶段，不能把所有日志耗时直接相加。普通 Dev 转换先返回模块结果，连续变化会在
短时间内合并，后台只更新变化源码对应的提取文件和语言消息；因此 `file-sync` 日志不等于浏览器被
同步阻塞。人工校对、Provider、外部协议文件变化、关闭 Dev Server 和完整 Build 等一致性边界仍会
等待必要的写入。

模块文案会随已经请求的业务源码同步进入共享 Runtime，不需要为每个源码再加载一个注册模块。
开启自动导入时，注入的 Runtime API 会在源码之间复用；关闭自动导入时，普通静态命名的
`virtual:ai-i18n` 显式 import 也会在 Dev 转换中复用同一个 internal Runtime，并在业务模块内建立
文件 scope。Vue 编译期宏参数引用的 binding，以及 namespace、动态 import、直接 re-export、
纯副作用或混合 type/未知导出的 import 会保留 scoped 兼容路径。如果网络面板仍出现大量业务模块，
先确认它们是否本来就是当前路由的 ESM 依赖。

Build 仍使用静态虚拟模块完成文件注册，但它们会被打进对应业务 chunk，并不等于每个源码文件产生
一个浏览器请求。排查生产请求数时应查看最终 chunk 与主动动态导入，而不是按构建模块数推断请求数。

如果这些阶段都没有慢日志，继续检查应用自己的路由守卫、鉴权接口和挂载时机。ai-i18n 不控制
应用何时调用 `mount()`。排查结束后关闭诊断，避免保留额外终端输出。

插件运行时入口默认合并到 Vite 的 `optimizeDeps.exclude`，不会覆盖项目已有的 include/exclude，
用于避免这些入口在首次打开动态路由时才触发依赖优化和整页重载。如果 Vite 的重载日志只列出
Vue Router、组件库或其他业务依赖，说明剩余重载来自项目自己的按需依赖发现，需要在应用侧评估是否
预构建；它不属于 ai-i18n 的文件同步耗时。

## 为什么切换语言后仍然显示源文案？

缺失翻译或值为 `null` 时，Runtime 固定回退到 source。检查
当前 Translation Memory 或 `i18n/overrides.json` 中是否存在目标 locale 的有效译文，并让
运行中的 Vite Dev 自动同步，或重新执行一次 Vite Build。

可以通过 [AI 翻译](/guide/advanced/ai-translation)配置 Provider，也可以通过
[接入 Agent](/guide/advanced/ai-tools)补齐缺失翻译。协议文件职责见
[生成文件与 Git](/guide/basic/directory)。

## 为什么按需加载语言包时切换失败？

配置 `loading` 后，未加载的目标语言会在 `setLang()` 时请求独立 chunk。加载失败时，
Promise 会 reject，并保留当前语言。Vue Composition 与 React 组件可使用 `useI18n()`
返回的 `isLangLoading` 和 `langLoadState.status === 'error'` 显示状态；纯 Vue Options
组件把 `i18nComputed()` 展开到 `computed` 后读取同名字段。需要业务级恢复动作时，捕获
Promise 并提供重试入口。

同时确认 `preload` 和 `prefetch` 只包含已配置的目标 locale，未包含 `sourceLang`，并且
同一 locale 没有同时出现在两个列表中。完整示例见
[语言分包与按需加载](/guide/basic/locale-loading)。

## 生成文件是否需要提交？

需要。权威译文与生成声明随源码提交，可重建的提取结果和语言包不提交。完整文件清单、Build
时机与 Monorepo 归属统一见[生成文件与 Git](/guide/basic/directory)；声明文件本身的作用见
[TypeScript 与生成声明](/guide/quality/typescript)。

## 修改模型或提示词后，为什么没有重新翻译？

Translation Memory 默认复用历史结果。插件不能可靠识别自定义 Translator 内部的模型、温度、提示词或
`baseURL`，也不会把这些配置写入缓存指纹。需要刷新一次时，在 Provider 中配置
`cache: 'fresh'`。本次 Vite 进程会主动刷新已有自动译文，并继续复用本进程新生成的结果。该选项不影响
MCP 或 AI Agent。完成后改回默认 `reuse`。详见
[Translation Memory](/guide/advanced/translation-memory)。

## 为什么 SQLite 没有复用另一个项目的译文？

SQLite 不会复用所有历史译文。当前项目尚无译文时，原文、源语言、目标语言和 `comment` 必须完全一致，
并且只能存在一个译文候选。多个候选可能代表不同语境，ai-i18n 会保持缺失，不会自动猜测。

请先确认项目内存在 `i18n/storage.json`，再按
[SQLite 未复用译文时如何排查](/guide/advanced/translation-memory#sqlite-未复用译文时如何排查)逐项检查。
