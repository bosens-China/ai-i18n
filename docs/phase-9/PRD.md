# Phase 9：框架自动导入与语言加载状态

状态：Passed。

## 背景

真实项目接入暴露出三类问题：

- Vue Router 文件路由生成的 `?definePage&vue&lang.tsx` 模块被误当作完整 SFC；
- Vue / React build 中的普通 `.js` / `.ts` 模块无法享受顶层 `t` 自动导入；
- 语言分包只有 `setLang()` Promise，没有可供多个组件共同观察的加载状态。

同时，ESLint 的自动导入识别必须与 Vite 实际注入保持一致，并避免为每个文件重复完成相同
的解析工作。

## 目标

### Vue 转换边界

- 跳过 Vue Router 的 `definePage`、Vite `raw` / `url` 资产请求和 Vue 编译器派生子模块。
- 不误伤 `<script src>` 等带 query 的合法外部脚本。
- 通过宿主 Vue 的 compiler-sfc Node 入口解析 SFC，使 imported `defineProps<T>()` /
  `defineEmits<T>()` 类型能获得 TypeScript 文件系统支持。
- Vite 与 `aiI18nVitest()` 使用一致的过滤与宏消除规则。

### 自动导入

- Vanilla 模式保持现有顶层 Runtime API。
- Vue 与 React 模式在 `autoImport: true` 时注入 `useI18n` 与 `t`。
- 生成声明、Vite 注入、Analyzer 识别和 `*-auto-import` ESLint preset 使用同一组模式契约；
  显式导入 preset 不声明 Runtime 全局。
- 框架组件仍通过 `useI18n()` 建立更新订阅；顶层 `t` 主要服务同一 build 中不能调用 Hook
  的普通模块。

### 语言加载状态

Runtime 暴露稳定快照：

```ts
type LangLoadState =
  | { status: 'idle'; targetLang: null; error: null }
  | { status: 'loading'; targetLang: string; error: null }
  | { status: 'error'; targetLang: string; error: unknown };
```

- `getLangLoadState()` 返回当前快照。
- Vue / React 的 `useI18n()` 返回 `langLoadState`、`isLangLoading` 与 `langLoadError`。
- loading 开始、成功与失败都通过现有 `subscribe()` 通知。
- 不同语言并发切换遵循 last-call-wins；过期请求的完成或失败不得覆盖最新状态。
- 初始非 source 默认语言的懒加载也必须可观察。

### ESLint 性能

- 同一 `SourceCode` 上，`tsconfig`、自动导入集合与候选上限相同的规则请求复用缓存的
  Analyzer 结果；默认 1000 候选预检命中上限时，静态参数规则才按需补一次无限制分析。
- 对 tsconfig 解析与模块路径的成功/失败探测做跨文件缓存，并保留配置/目录变化后的失效边界。
- 不承诺跨入口复用依赖源码、AST 或 import binding；是否继续优化由真实项目基准决定。
- 用行为与调用次数测试验证优化，不把机器耗时阈值写入单元测试。

### 文档

- 说明 framework build 与单文件扩展名的关系。
- 说明 `defineI18nMessages()` 的适用模式与生成声明。
- 更新自动导入、语言加载状态、Runtime API 与 Vue / React 接入 Skill。

## 非目标

- 不把任意 SFC 编译错误降级为 warning；真实源码错误继续阻断构建。
- 不让顶层 `t()` 自动创建 Vue / React 组件订阅。
- 不改变 MCP 工具与协议目录契约。
