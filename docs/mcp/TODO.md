# MCP TODO

> 对应文档：[MCP PRD](./PRD.md)

- [x] 新增独立 `@ai-i18n/mcp` 发布包与 stdio 入口。
- [x] MCP 注册与启动不要求项目路径参数。
- [x] 三个翻译工具统一接收绝对 `i18n_directory`。
- [x] 不扫描 workspace；由 Agent 根据目标 Vite build 提供最终协议目录。
- [x] 拒绝相对路径，通过 realpath 校验目录，并要求协议输入文件与 `extracted/` 已存在。
- [x] 查询前校验 `translations.json`、`overrides.json` 与 extracted 消息归属。
- [x] 列出缺失翻译文件，默认 50 条并支持 cursor。
- [x] 列出翻译详情，默认 100 条、支持过滤和字符上限。
- [x] 批量填充 AI Memory 的 `null`，人工审校单独写 overrides。
- [x] 人工审校支持 source default 与显式 message ID scope。
- [x] Vite 与 MCP 共用跨进程锁、锁内重读、字段级更新和原子替换事务。
- [x] 只接受当前协议，不保留未发布版本的迁移分支。
- [x] 为分页、有效值合并、写入冲突和绝对路径校验添加 Vitest。
- [x] 列表工具同时返回完整 JSON 文本和 `structuredContent`。
- [x] 更新 README 与发布包检查。
