# Phase 4 PRD：真实项目接入改进

> 状态：Implemented
>
> MCP workspace 自动发现属于本阶段的历史实现，已被最终 MCP 契约取代。当前调用方必须传入
> 目标构建的绝对 `i18n_directory`，服务端不会扫描 workspace。参见
> [`docs/mcp/PRD.md`](../mcp/PRD.md)。

## 目标

根据 DropRoom 在 Windows、Vite Build Watch、Vitest、MCP 与运行时切换语言时的真实接入
反馈，修复数据完整性问题并降低接入成本。

## 契约

- 所有传给 Vite `resolve`、watch 与 `load` 的本地模块 ID 均使用规范化路径。
- registration 只加载静态求值 `t()` 参数真正依赖的模块；普通业务依赖不进入注册加载链。
- Dev 增量同步保留尚未进入当前模块图的 extracted 消息；完整 Build 以最终模块图权威重建
  locales，并删除失效 extracted。
- `t` 同时支持 `t(source, { comment? })` 与 `` t`你好 ${name}` ``。模板表达式使用
  `{{0}}`、`{{1}}` 占位，翻译可调整占位顺序但不可增删。
- comment 提供翻译上下文并参与 message ID；source 或 comment 变化都会形成新消息。
- `@ai-i18n/vite/vitest` 提供不读写协议文件的测试期虚拟模块。
- Runtime 支持语言偏好持久化；初始语言使用有效持久化值或 `defaultLang`，缺译固定返回
  source。已写入业务 state 的译后字符串不自动更新，应用应在展示层调用 `t` 或保存 message ID。
- （历史契约，现已取代）MCP 可自动发现 workspace 内协议目录，发现和列表结果同时提供完整
  JSON 文本与结构化数据。
- alpha 阶段所有面向用户和 Agent 的安装说明显式使用 `@alpha`。

## 非目标

- 自动接管 Ant Design、日期库等第三方 locale；文档说明如何由 `currentLang` 派生。
- 让已经保存到 toast、error 或其他业务 state 的历史字符串自动重新翻译。
- 由 MCP 执行 Vite 配置或修改 cache/locales。
