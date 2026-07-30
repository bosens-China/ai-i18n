# Phase 10：翻译结果生命周期 ESLint 诊断

状态：Passed。

## 背景

静态提取成功不代表译文会随语言切换刷新。顶层执行 `t()` 后保存字符串只得到初始化时的
快照；Vue / React 组件在渲染路径直接调用 Runtime 顶层 `t` 也不会建立框架订阅。后者还
可能在 React Compiler 缓存下长期复用旧结果。

## 目标

### 初始化快照

新增 `ai-i18n/no-eager-translation`：

- 当 ai-i18n 的 `t()` 或 tagged template 在函数之外求值，并把结果保存到变量、对象、
  数组、赋值、类字段或默认导出时发出 warning。
- Vue SFC 直接导出的组件 options，以及 `.vue` / `.ts` / `.tsx` 中从 `vue` 导入的
  `defineComponent()` 对象或函数签名，视为一次性初始化边界；普通对象的同名方法与本地
  同名 `defineComponent` 仍按普通函数处理。
- 函数、箭头函数、getter 与事件回调中的延迟调用允许。
- 支持显式 import、重导出、自动导入、Hook/composable 派生 `t` 和 Vue SFC source map。

### 无订阅组件渲染

新增 `ai-i18n/no-unsubscribed-t`：

- Vue / React JSX 或 TSX 的组件渲染函数直接调用 Runtime 顶层 `t` 时发出 warning。
- `useI18n()` 返回的 `t` 允许；事件回调中的 Runtime `t` 允许。
- 独立的 `console.log` / `warn` / `error` / `info` / `debug` 参数属于明确的即时消费；
  其他未知调用可能缓存参数，继续发出 warning。
- React Compiler directive 不改变判断：`"use memo"` 与 `"use no memo"` 都不能替代
  Runtime 订阅。
- `recommended`、显式导入的 `vue` 以及 Vue / React 自动导入 preset 默认启用。
- Vue template 中绑定到 Runtime 顶层 `t` 的调用同样提示缺少订阅；`vue-auto-import`
  下没有 `<script setup>` binding 的裸 template-only `t` 由 `t-static-args` 报 error。

### React Compiler

- React adapter 继续通过 `useSyncExternalStore` 订阅 Runtime revision。
- Hook 返回的 `t` 在 revision 变化时更换函数引用，使 React Compiler 的缓存依赖失效。
- 使用真实 `babel-plugin-react-compiler` Vite 构建测试验证编译链路。

### 诊断与性能

- 两条规则复用同一文件中配置与候选上限兼容的 Analyzer 结果；超过默认候选预检上限时
  允许静态参数规则按需补一次无限制分析。
- 任意规则独立启用时都报告分析失败；同一文件只报告一次，官方 preset 由
  `t-static-args` 优先承担 error。
- 诊断同时提供中文和英文。
- 不提供自动修复；生命周期重构需要开发者决定函数、getter 或组件 Hook 的边界。

### 自动导入冗余 import

新增可选规则 `ai-i18n/no-redundant-auto-import`：

- 由规则选项精确声明当前 Vite 框架模式实际注入的 Runtime API，不读取或猜测 Vite 配置。
- 只报告来自 `virtual:ai-i18n`、导入名与本地名相同且位于声明集合中的值导入。
- 改名导入、namespace import、type import 和当前模式未自动注入的 API 不误报。
- 支持安全自动修复：全部冗余时删除声明，混合 import 仅删除冗余成员；import 内部有注释时
  只提示，不自动改写。
- 规则不加入任何 preset，由希望统一为纯自动导入风格的项目按需启用。
- 诊断同时提供中文和英文。

## 明确边界

第一版只分析当前文件中的直接调用与语法生命周期，不追踪：

- 跨函数或跨文件的调用图；
- 任意第三方函数是否立即执行或缓存回调；
- `useMemo`、`useState`、`useEffect` 等框架 API 内保存译后字符串的数据流；
- 显式导入模式下无法证明属于 ai-i18n 的未知 Vue 组件上下文属性。

这些边界用于避免高误报。文档不得宣称规则能发现所有不会刷新的译文。

## 非目标

- 不改变 `t()`、`useI18n()` 或 Runtime 的公开签名。
- 不让 Runtime 顶层 `t` 自动创建组件订阅。
- 不改变 MCP 与协议目录。
