# MCP TODO

> 对应文档：[MCP PRD](./PRD.md)

- [x] 新增独立 `@boses/mcp` 发布包与 stdio 入口。
- [x] 支持 cwd 和 `--root` workspace 边界。
- [x] 三个工具统一接收 workspace-relative `i18n_directory`。
- [x] 拒绝绝对路径、`..` 与 symlink workspace 逃逸。
- [x] 查询前校验并合并 cache/extracted Translation Memory。
- [x] 列出缺失翻译文件，默认 50 条并支持 cursor。
- [x] 列出翻译详情，默认 100 条、支持过滤和字符上限。
- [x] 批量填充 `null`，支持空字符串并拒绝覆盖非空值。
- [x] 写入使用单进程队列、临时文件和 rename。
- [x] 为分页、有效值合并、写入冲突和路径边界添加 Vitest。
- [x] 更新 README 与发布包检查。
