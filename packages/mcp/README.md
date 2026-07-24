# @ai-i18n/mcp

本地 stdio MCP server，用于列出 ai-i18n 缺失翻译、读取具体文案，并安全填充
`extracted/**` 中仍为 `null` 的翻译。

MCP 不执行 Vite 配置。Agent 先用 `ai_i18n_discover` 从客户端 workspace roots 自动发现
协议目录，再把返回的绝对 `i18n_directory` 传给列表和写入工具。发现多个候选时才需要读取
`vite.config.*` 确认目标。

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
写入工具只填充缺失值，不覆盖已有非空翻译。修改会落到 extracted 文件；运行中的 Vite Dev
会自动同步，未运行时由下一次 `vite dev` 或 `vite build` 校准 cache、其他 extracted 与 locales。
