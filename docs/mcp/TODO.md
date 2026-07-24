# MCP TODO

> 对应文档：[MCP PRD](./PRD.md)

- [x] 新增独立 `@ai-i18n/mcp` 发布包与 stdio 入口。
- [x] MCP 注册与启动不要求项目路径参数。
- [x] 三个翻译工具统一接收绝对 `i18n_directory`。
- [x] 新增基于 MCP workspace roots、进程目录或显式 `cwd` 的协议目录发现工具。
- [x] 拒绝相对路径，并通过 realpath 校验目录。
- [x] 查询前校验并合并 cache/extracted Translation Memory。
- [x] 列出缺失翻译文件，默认 50 条并支持 cursor。
- [x] 列出翻译详情，默认 100 条、支持过滤和字符上限。
- [x] 批量填充 `null`，支持空字符串并拒绝覆盖非空值。
- [x] 写入使用单进程队列、临时文件和 rename。
- [x] 为分页、有效值合并、写入冲突和绝对路径校验添加 Vitest。
- [x] 发现与列表工具同时返回完整 JSON 文本和 `structuredContent`。
- [x] 更新 README 与发布包检查。
