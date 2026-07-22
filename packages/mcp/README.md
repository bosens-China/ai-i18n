# @ai-i18n/mcp

本地 stdio MCP server，用于列出 ai-i18n 缺失翻译、读取具体文案，并安全填充
`extracted/**` 中仍为 `null` 的翻译。

MCP 不执行 Vite 配置。调用工具前，Agent 应读取项目的 `vite.config.*`，结合 Vite root 与
`aiI18n({ directory })`，传入相对于 MCP workspace root 的最终 `i18n_directory`。

```json
{
  "command": "ai-i18n-mcp",
  "args": ["--root", "/workspace/repo"]
}
```

提供三个工具：

- `ai_i18n_list_translation_files`
- `ai_i18n_list_translations`
- `ai_i18n_write_translations`

写入工具只填充缺失值，不覆盖已有非空翻译。修改会落到 extracted 文件；运行中的 Vite Dev
会自动同步，未运行时由下一次 `vite dev` 或 `vite build` 校准 cache、其他 extracted 与 locales。
