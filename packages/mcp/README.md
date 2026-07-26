# @ai-i18n/mcp

本地 stdio MCP server，用于列出 ai-i18n 缺失翻译、读取有效文案，并安全填充
`translations.json` 或提交 `overrides.json` 人工审校值。

MCP 不执行 Vite 配置。Agent 先用 `ai_i18n_discover` 从客户端 workspace roots 自动发现
协议目录，再把返回的绝对 `i18n_directory` 传给列表和写入工具。发现多个候选时才需要读取
`vite.config.*` 确认目标。客户端未提供 workspace roots 时，discover 回退 MCP 进程目录；
也可以显式传入 `cwd` 作为回退。

MCP 宿主可以直接执行 npm 包：

```json
{
  "command": "npx",
  "args": ["-y", "@ai-i18n/mcp@alpha"]
}
```

如果已经在本地或全局安装，也可以把 `command` 改成包提供的 `ai-i18n-mcp`，无需参数。
server 使用 stdio 通信，标准输出专用于 MCP 协议。

提供四个工具：

- `ai_i18n_discover`
- `ai_i18n_list_translation_files`
- `ai_i18n_list_translations`
- `ai_i18n_write_translations`

发现与列表工具同时返回完整 JSON 文本和 `structuredContent`，大结果使用 cursor 分页。
写入工具默认使用 `mode: "fill"`，只填充缺失值。人工确认修订时可显式使用
`mode: "review"`；默认影响同一原文的全部调用，`review_scope: "message"` 只影响带显式
ID 的消息。fill 写 `translations.json`，review 写 `overrides.json`，两者都在跨进程锁内重读；
运行中的 Vite Dev 会自动重建 locales，未运行时由下一次 `vite dev` 或 `vite build`
校准派生文件。

写入时若指定文件中没有对应 `message_id`，工具只报告消息不存在。请重新列出该文件并使用
返回的 `message_id`，不要用 `source` 代替。
