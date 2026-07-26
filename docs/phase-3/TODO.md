# Phase 3 TODO

> 本清单是历史实施记录，不是当前实现规范。现行持久化、诊断与 MCP 契约分别见
> [Phase 7](../phase-7/PRD.md)、[Phase 8](../phase-8/PRD.md) 与
> [`docs/mcp/PRD.md`](../mcp/PRD.md)；未发布的旧 schema 不要求兼容或迁移。

- [x] Translation Memory 移除可由 extracted 与 ProjectState 推导的 file records。
- [x] 基于 extracted 与 ProjectState 计算活动 message。
- [x] 增加 source language 反向 Translation Memory 查找。
- [x] 只生成目标 locale 文件。
- [x] extracted 改为扁平、可读、无碰撞的文件名。
- [x] 修复 React Compiler 下部分组件不更新的问题。
- [x] 更新 MCP、用户文档与项目技能。
- [x] 增加 schema、文件存储、反向复用和 React 回归测试。
- [x] 在真实 DropRoom 页面完成外部验收。
