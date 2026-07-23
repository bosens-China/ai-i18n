---
title: AI 工具接入
description: 安装 Agent skills，并用 MCP 列出与填充缺失翻译
---

把 ai-i18n 接到 AI 编码 Agent 时，推荐同时使用 **skills** 与 **MCP**：

- skills：告诉 Agent 如何接入插件、如何安全补译。
- MCP：提供分页读取与写回 `extracted/**` 的工具。

## 安装 Agent skills

仓库提供两个 skill：

| skill               | 用途                                             |
| ------------------- | ------------------------------------------------ |
| `integrate-ai-i18n` | 把 `@boses/vite` 接入 Vanilla / Vue / React 项目 |
| `use-ai-i18n-mcp`   | 通过 MCP 列出缺失翻译并安全写回                  |

在目标项目中执行：

```sh
npx skills add bosens-China/ai-i18n
```

按提示选择上述两个 skill（或安装全部）。也可显式指定：

```sh
npx skills add bosens-China/ai-i18n \
  --skill integrate-ai-i18n \
  --skill use-ai-i18n-mcp
```

先查看可用 skill：

```sh
npx skills add bosens-China/ai-i18n --list
```

安装后，Agent 在接入配置或补译任务时会自动匹配对应 skill。

## 注册 MCP

`@boses/mcp` 是本地 stdio MCP server。它用于列出缺失翻译、分页读取详情，
并安全填充 `extracted/**` 中仍为 `null` 的值。

```json
{
  "command": "npx",
  "args": ["-y", "@boses/mcp", "--root", "/workspace/repo"]
}
```

已安装时也可直接使用 `ai-i18n-mcp`，并保留 `--root`。标准输出专用于 MCP 协议。

### 能力与边界

- **会做**：读写协议目录里的 extracted；只填充缺失值，不覆盖已有非空翻译。
- **不会做**：不执行 `vite.config.*`，不扫描业务源码，不直接修改 cache 或 locales。

写入后，若 Vite Dev 正在运行，会自动同步。否则由下一次 `vite dev` 或 `vite build`
校准 cache、其他 extracted 与 locales。

### `i18n_directory`

每个工具都需要相对 MCP workspace root 的最终协议目录。调用前应先读取项目的
`vite.config.*`，结合 Vite root 与 `aiI18n({ directory })` 算出路径，例如 monorepo 中的
`apps/web/i18n`。

### 工具一览

| 工具                             | 作用                                                     |
| -------------------------------- | -------------------------------------------------------- |
| `ai_i18n_list_translation_files` | 列出仍有缺失翻译的源码文件。可按 locale 过滤，支持分页。 |
| `ai_i18n_list_translations`      | 分页读取文件或全项目去重后的翻译详情。                   |
| `ai_i18n_write_translations`     | 批量填充缺失翻译；拒绝覆盖非空值。                       |

更完整的操作步骤由 `use-ai-i18n-mcp` skill 约束。
