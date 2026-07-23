# @boses/mcp

本地 stdio MCP server，用于列出 ai-i18n 缺失翻译、读取具体文案，并安全填充
`extracted/**` 中仍为 `null` 的翻译。

MCP 不执行 Vite 配置。调用工具前，Agent 应读取项目的 `vite.config.*`，结合 Vite root 与
`aiI18n({ directory })`，传入相对于 MCP workspace root 的最终 `i18n_directory`。

MCP 宿主可以直接执行 npm 包（alpha 阶段将版本标签替换为 `@alpha`）：

```json
{
  "command": "npx",
  "args": ["-y", "@boses/mcp", "--root", "/workspace/repo"]
}
```

如果已经在本地或全局安装，也可以把 `command` 改成包提供的 `ai-i18n-mcp`，并仅保留
`--root` 参数。server 使用 stdio 通信，标准输出专用于 MCP 协议。

提供三个工具：

- `ai_i18n_list_translation_files`
- `ai_i18n_list_translations`
- `ai_i18n_write_translations`

写入工具只填充缺失值，不覆盖已有非空翻译。修改会落到 extracted 文件；运行中的 Vite Dev
会自动同步，未运行时由下一次 `vite dev` 或 `vite build` 校准 cache、其他 extracted 与 locales。
