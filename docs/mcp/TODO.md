# MCP TODO

> 对应文档：[MCP PRD](./PRD.md)

- [x] 新增独立 `@ai-i18n/mcp` 发布包与 stdio 入口。
- [x] MCP 注册与启动不要求项目路径参数。
- [x] 六个工具统一接收绝对 `i18n_directory`，不扫描 workspace。
- [x] 拒绝相对路径，通过 realpath 校验目录，并要求合法的 `translations.json`、
      `overrides.json` 与 `extracted/`。
- [x] 合并文件发现、进度汇总和消息读取，首次调用无需预知 `source_files`。
- [x] 翻译列表支持 `missing`、`summary`、`all`、locale/source file 过滤、cursor 与字符上限。
- [x] 翻译设置默认只填 `null`，显式允许覆盖，并提供独立清空工具。
- [x] 人工审校提供独立列表、upsert 与删除工具，支持 default/message scope 和 orphan。
- [x] Vite 与 MCP 共用跨进程锁、锁内重读、字段更新和原子替换事务。
- [x] 每批最多 100 个目标，执行重复目标、归属、locale 与模板 token 校验。
- [x] 只接受当前协议，不保留旧工具名、`mode` 或 `review_scope` 兼容分支。
- [x] 所有结果只返回一份紧凑 JSON `TextContent`，不声明 output schema 或
      `structuredContent`。
- [x] 工具元数据、字段与稳定错误码使用英文，由 Agent 负责用户语言表达。
- [x] 为查询、分页、设置、覆盖、清空、删除、并发锁与 MCP transport 添加 Vitest。
- [x] 更新用户文档、内部 PRD、README 与两份 Agent skill。
