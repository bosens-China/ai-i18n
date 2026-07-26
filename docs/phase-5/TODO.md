# Phase 5 TODO

> 对应文档：[Phase 5 PRD](./PRD.md)

- [x] 通过共享事务锁与 `atomically` 协调 Vite / MCP 原子写入，并保留实际文件错误上下文。
- [x] extracted 读取时跳过并提示已消失的单文件；locale 始终由协议数据单向生成。
- [x] 一次性 Build 复用 ProjectState，移除 transform / registration / HTML 的重复落盘。
- [x] 覆盖陈旧 extracted 的结构差异、partial / complete 与 orphan 清理边界。
- [x] 删除未发布的旧命名占位符迁移分支。
- [x] 改进 MCP stale message 提示，要求重新 list 并复制 canonical `message_id`。
- [x] 更新用户文档和两个 Agent skills。
- [x] 完成相关测试、TypeScript、ESLint 与文档构建。
