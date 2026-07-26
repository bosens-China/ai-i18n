# Phase 5 PRD：真实项目文件 IO 改进

> 状态：Implemented
>
> 手写 rename 重试已由 [Phase 7](../phase-7/PRD.md) 的共享锁与 `atomically` 取代；
> 本文件保留 Phase 5 历史背景。

## 目标

根据 DropRoom 在 Windows 构建、外部编辑 generated JSON 和 MCP 写入中的反馈，降低短暂
文件锁和重复落盘造成的失败。

## 契约

- Vite 与 MCP 的临时文件 rename 遇到 `EPERM`、`EACCES`、`EBUSY` 时有限重试；
  不预删目标文件，不静默修改文件权限，重试耗尽后报告实际协议文件。
- Vite 在列目录后读取 generated JSON 时，单个文件若已消失则跳过并 warning；非法 JSON、
  权限错误和其他 IO 错误仍然失败。
- 一次性 Build 在内存 `ProjectState` 中完成提取和 Provider 回写，仅在完整模块图可用后同步
  协议文件。Dev/HMR 与 Build Watch 的外部协议文件编辑继续即时同步。
- 外部编辑的 extracted 与当前已分析 source 结构不一致时，源码分析结果决定消息结构；
  外部文件只为仍存在的 message ID 提供翻译，并给出重新加载文件的 warning。
- MCP 的 stale message 错误提示用户先运行 Vite 对账、重新 list，并原样复制 `message_id`。
- 用户文档明确：持久化数据、文件匹配和业务标识保存稳定语义值，译文只在展示边界生成。

## 非目标

- 预删 rename 目标、静默 `chmod` 或绕过 VCS 文件锁。
- 接受 `source` 代替 MCP 的 canonical `message_id`。
- 新增 cache prune CLI 或通用 codemod 框架。
- 为少量已知 sink 新增高误报的 ESLint 规则。
