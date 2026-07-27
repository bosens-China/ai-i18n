# @ai-i18n/mcp

本地 stdio MCP server，为 Agent 提供 ai-i18n 翻译与人工审校的查询、设置和删除能力。

MCP 不扫描 workspace，也不执行 Vite 配置。Agent 必须先确认目标 Vite 应用，读取它的
`vite.config.*` 和启动脚本，再将 Vite `root` 与 `aiI18n({ directory })`（默认 `i18n`）
解析为最终绝对 `i18n_directory`。在 monorepo 中，每个 Vite build 分开处理，不能把仓库
根目录或第一个同名目录当成协议目录。

MCP 会校验绝对路径、目录是否存在，以及 `translations.json`、`overrides.json` 和
`extracted/` 是否符合当前协议。缺少协议文件时，先运行目标应用的 Vite Dev/Build。

MCP 宿主可以直接执行 npm 包：

```json
{
  "command": "npx",
  "args": ["-y", "@ai-i18n/mcp@alpha"]
}
```

如果已经在本地或全局安装，也可以把 `command` 改成包提供的 `ai-i18n-mcp`，无需参数。
server 使用 stdio 通信，标准输出专用于 MCP 协议。

## 工具

- `ai_i18n_list_translations`：默认直接列出 `translations.json` 中仍缺失的消息，也可返回
  文件汇总或全部消息。首次调用省略 `source_files` 即可发现路径。
- `ai_i18n_set_translations`：默认只填充 `null`；显式传
  `overwrite_existing: true` 时允许覆盖非空译文。
- `ai_i18n_clear_translations`：把指定译文重置为 `null`，不删除消息或 locale。
- `ai_i18n_list_overrides`：逐 locale 列出 `overrides.json` 中的人工值，包括 orphan，并
  返回删除所需的 opaque `override_id`。
- `ai_i18n_set_overrides`：添加或覆盖人工值；`default` scope 影响同一原文的全部调用，
  `message` scope 只接受带 comment 的消息。
- `ai_i18n_delete_overrides`：使用列表返回的 `override_id` 删除具体人工值。

列表结果较大时继续按 `next_cursor` 分页。所有工具只返回一份紧凑 JSON
`TextContent`，不重复返回 `structuredContent`。工具名、字段名、描述和错误码使用英文，
由 Agent 按用户语言解释。

## 写入边界

- 翻译工具只修改 `translations.json`；人工审校工具只修改 `overrides.json`。
- MCP 不修改 `extracted/` 或 `locales/`。
- 每批写入都取得跨进程锁，在锁内重读并校验最新文件，然后按字段原子更新。
- 每批最多 100 个目标，重复目标或任一非法目标会使整批失败。
- 模板占位符必须保持一致，空字符串是合法译文。
- Vite Dev 运行时会自动重建 locales；否则在下一次 `vite dev` 或 `vite build` 时同步。

写入时若指定文件中没有对应 `message_id`，请重新调用
`ai_i18n_list_translations`，并原样复制返回的 `source_file` 与 `message_id`；
不要用 `source` 代替。
