# Phase 5 PRD：真实项目文件 IO 改进

> 状态：历史实施记录（非规范）
>
> 当前文件写入以 [Phase 7](../phase-7/PRD.md) 的共享事务锁与 `atomically` 原子替换为准。

## 目标

根据 DropRoom 在 Windows 构建、协议文件变更和 MCP 写入中的反馈，降低短暂
文件锁和重复落盘造成的失败。

## 契约

- Vite 与 MCP 通过共享事务锁协调协议文件写入，并使用 `atomically` 原子替换；不预删目标
  文件，不静默修改文件权限，失败时报告实际协议文件。
- Vite 在列出 extracted 目录后读取结构快照时，单个文件若已消失则跳过并 warning；非法 JSON、
  权限错误和其他 IO 错误仍然失败。
- 一次性 Build 在内存 `ProjectState` 中完成提取和 Provider 回写，仅在完整模块图可用后同步
  协议文件。Dev/HMR 与 Build Watch 对 `translations.json`、`overrides.json` 的外部变更
  继续即时同步。
- 源码分析结果决定消息结构；extracted 仅保存结构快照，不包含翻译。结构过期时提示重新加载，
  并由 Vite 重建。
- locale 由 Translation Memory 与人工覆盖单向生成，不作为翻译写回来源。
- MCP 的 stale message 错误提示用户先运行 Vite 对账、重新 list，并原样复制 `message_id`。
- 用户文档明确：持久化数据、文件匹配和业务标识保存稳定语义值，译文只在展示边界生成。

## 非目标

- 预删原子替换目标、静默 `chmod` 或绕过 VCS 文件锁。
- 接受 `source` 代替 MCP 的 canonical `message_id`。
- 新增 cache prune CLI 或通用 codemod 框架。
- 为少量已知 sink 新增高误报的 ESLint 规则。
