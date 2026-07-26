# @ai-i18n/mcp

本地 stdio MCP server，用于列出 ai-i18n 缺失翻译、读取有效文案，并安全填充
`translations.json` 或提交 `overrides.json` 人工审校值。

MCP 不扫描 workspace，也不执行 Vite 配置。Agent 必须先确认目标 Vite 应用，读取它的
`vite.config.*` 和启动脚本，再将 Vite `root` 与 `aiI18n({ directory })`（默认 `i18n`）
解析为最终绝对 `i18n_directory`。在 monorepo 中，每个 Vite build 分开处理，不能把仓库
根目录当成协议目录。MCP 会校验绝对路径、目录是否存在，以及 `translations.json`、
`overrides.json` 和 `extracted/` 是否符合当前协议；校验失败时直接报错。

MCP 宿主可以直接执行 npm 包：

```json
{
  "command": "npx",
  "args": ["-y", "@ai-i18n/mcp@alpha"]
}
```

如果已经在本地或全局安装，也可以把 `command` 改成包提供的 `ai-i18n-mcp`，无需参数。
server 使用 stdio 通信，标准输出专用于 MCP 协议。

提供三个工具：

- `ai_i18n_list_translation_files`
- `ai_i18n_list_translations`
- `ai_i18n_write_translations`

列表工具同时返回完整 JSON 文本和 `structuredContent`，大结果使用 cursor 分页。缺失状态按
`byId > default > AI Memory` 解析；只有最终有效值为 `null` 时才算缺失。
写入工具默认使用 `mode: "fill"`，只填充缺失值。人工确认修订时可显式使用
`mode: "review"`；默认影响同一原文的全部调用，`review_scope: "message"` 只影响带
`comment` 的目标消息。`fill` 写 `translations.json`，`review` 写 `overrides.json`。两种模式都会
在各自目标文件的共享事务内加锁、重读并复验，确认后才写入。
运行中的 Vite Dev 会自动重建 locales，未运行时由下一次 `vite dev` 或 `vite build`
校准派生文件。

写入时若指定文件中没有对应 `message_id`，工具只报告消息不存在。请重新列出该文件并使用
返回的 `message_id`，不要用 `source` 代替。
