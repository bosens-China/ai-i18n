---
title: AI 工具接入
description: 在 Codex、Claude Code、Cursor 与 Antigravity 中安装 skills，并接入 ai-i18n MCP
---

把 ai-i18n 接到 AI 编码工具时，推荐同时安装 **Agent Skills** 与 **MCP**：

- Agent Skills 告诉 Agent 如何接入 `@ai-i18n/vite`，以及如何按安全流程补译。
- MCP 提供查询与写回工具，让 Agent 可以读取 `extracted/**` 并填充缺失翻译。

两者缺一也能使用，但只接 MCP 时，Agent 仍可能误判协议目录或直接修改生成文件；安装
`use-ai-i18n-mcp` 后，补译流程会更稳定。

## 开始前

请先确认：

1. 已安装 Node.js，并可在终端中运行 `npx`。
2. 在目标项目的仓库根目录执行 Skill 安装命令。
3. 把后文的 `/absolute/path/to/repo` 替换为仓库根目录的**绝对路径**，不要填写
   `i18n` 或 `extracted` 目录。

仓库提供两个 Skill：

| Skill               | 推荐场景                                        |
| ------------------- | ----------------------------------------------- |
| `integrate-ai-i18n` | 安装、升级或检查 Vanilla、Vue、React 的接入配置 |
| `use-ai-i18n-mcp`   | 查询缺失翻译、生成译文并通过 MCP 安全写回       |

可以先确认远端仓库中可安装的 Skill：

```sh
npx skills add bosens-China/ai-i18n --list
```

## Codex

### 导入 Skills

在仓库根目录执行：

```sh
npx skills add bosens-China/ai-i18n --agent codex --skill integrate-ai-i18n use-ai-i18n-mcp -y
```

项目级 Skill 会安装到 `.agents/skills/`。新会话会自动发现 Skill；也可以在提示词中显式
写出 `$integrate-ai-i18n` 或 `$use-ai-i18n-mcp`。如果当前会话没有显示新 Skill，请重启
Codex。

### 接入 MCP

在 `~/.codex/config.toml` 中加入：

```toml
[mcp_servers.ai_i18n]
command = "npx"
args = ["-y", "@ai-i18n/mcp", "--root", "/absolute/path/to/repo"]
```

也可以把配置写到受信任项目的 `.codex/config.toml`。由于 `--root` 通常是每位开发者
不同的绝对路径，个人配置更适合直接使用；项目配置提交前应避免写入仅在本机有效的路径。

Codex 桌面端还可以在 **Settings → MCP servers → Add server → STDIO** 中填写相同的
command 与 args。保存后重启，在 `/mcp` 中确认 `ai_i18n` 已连接。桌面端、CLI 和 IDE
扩展会共享同一份 MCP 配置。

参考：[Codex 自定义与 Skills](https://learn.chatgpt.com/docs/customization/overview)、
[Codex MCP 配置](https://learn.chatgpt.com/docs/extend/mcp)。

## Claude Code

### 导入 Skills

在仓库根目录执行：

```sh
npx skills add bosens-China/ai-i18n --agent claude-code --skill integrate-ai-i18n use-ai-i18n-mcp -y
```

Skill 会安装到 `.claude/skills/`。重新启动 Claude Code 后，可以直接描述任务让 Claude
自动选择，也可以在提示词中点名 `integrate-ai-i18n` 或 `use-ai-i18n-mcp`。

### 接入 MCP

推荐先注册为仅当前用户、当前项目可见的 local server，避免把本机绝对路径提交到仓库：

```sh
claude mcp add --transport stdio --scope local ai-i18n -- npx -y @ai-i18n/mcp --root /absolute/path/to/repo
```

注册后在 Claude Code 中输入 `/mcp`，确认 `ai-i18n` 已连接。

团队需要共享配置时，可把 `--scope local` 改成 `--scope project`。Claude Code 会在仓库
根目录生成 `.mcp.json`；提交前仍要处理不同开发者的绝对路径问题。

参考：[Claude Code Skills](https://code.claude.com/docs/en/skills)、
[Claude Code MCP](https://code.claude.com/docs/en/mcp)。

## Cursor

### 导入 Skills

在仓库根目录执行：

```sh
npx skills add bosens-China/ai-i18n --agent cursor --skill integrate-ai-i18n use-ai-i18n-mcp -y
```

当前安装器使用跨工具通用的 `.agents/skills/`；Cursor 也支持自己的
`.cursor/skills/`。重新打开项目后，可在 Cursor 的 Skills 列表中确认两个 Skill 已被
发现。

### 接入 MCP

创建项目级 `.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "ai-i18n": {
      "command": "npx",
      "args": ["-y", "@ai-i18n/mcp", "--root", "/absolute/path/to/repo"]
    }
  }
}
```

若只想在本机使用，也可以把同样的配置写到 `~/.cursor/mcp.json`。保存后在聊天窗口的
MCP / Available Tools 中确认三个 `ai_i18n_*` 工具已经出现；未连接时，先检查路径，再
重载 Cursor 窗口。

参考：[Cursor Agent Skills](https://cursor.com/docs/context/skills)、
[Cursor MCP](https://cursor.com/docs/context/mcp)。

## Antigravity

### 导入 Skills

在仓库根目录执行：

```sh
npx skills add bosens-China/ai-i18n --agent antigravity --skill integrate-ai-i18n use-ai-i18n-mcp -y
```

项目级 Skill 位于 `.agents/skills/`，这是 Antigravity 当前推荐的跨工具目录。新建会话
后，可询问“当前有哪些 Skills”确认导入结果；也可以在任务中直接点名 Skill。

### 接入 MCP

创建项目级 `.agents/mcp_config.json`：

```json
{
  "mcpServers": {
    "ai-i18n": {
      "command": "npx",
      "args": ["-y", "@ai-i18n/mcp", "--root", "/absolute/path/to/repo"]
    }
  }
}
```

全局配置对应 `~/.gemini/config/mcp_config.json`。在 Antigravity IDE 中也可以依次打开
**Agent 侧栏 → … → MCP Servers → Manage MCP Servers → View raw config** 编辑配置；
保存后刷新 MCP Servers。Antigravity CLI 用户可输入 `/mcp` 查看连接状态和日志。

参考：[Antigravity Skills](https://antigravity.google/docs/skills?app=antigravity-ide)、
[Antigravity MCP](https://antigravity.google/docs/mcp)。

## 推荐的补译流程

完成 Skill 与 MCP 接入后，可以直接发出以下提示词：

```text
使用 use-ai-i18n-mcp：
1. 读取 Vite 配置，结合 Vite root 与 aiI18n({ directory }) 计算 i18n_directory；
2. 列出所有仍有缺失翻译的文件；
3. 按原文语义和项目现有术语补齐目标语言；
4. 只通过 ai_i18n_write_translations 写入 null 值，不覆盖已有翻译；
5. 再次查询并报告剩余缺失项。
```

处理单个语言或文件时，直接补充限制条件，例如：

```text
使用 use-ai-i18n-mcp，只补 apps/web/src/pages/Home.vue 的日语翻译。
保留插值变量、产品名和代码标识符，不覆盖已有非空翻译，完成后复查剩余缺失项。
```

### `i18n_directory` 如何确定

每个 MCP 工具都需要一个相对于 MCP workspace root 的最终协议目录。不要仅凭目录名猜测，
应先读取项目的 `vite.config.*`，结合 Vite `root` 与 `aiI18n({ directory })` 计算：

- 单项目常见结果：`i18n`
- monorepo 常见结果：`apps/web/i18n`
- 如果 MCP 的 `--root` 已指向 `apps/web`，对应结果仍可能是 `i18n`

MCP 不会执行 `vite.config.*`，也不会扫描业务源码，所以这一步由 Agent 读取配置后完成。

## MCP 能力与边界

| 能力                             | 说明                                                   |
| -------------------------------- | ------------------------------------------------------ |
| `ai_i18n_list_translation_files` | 列出仍有缺失翻译的源码文件，可按 locale 过滤并分页。   |
| `ai_i18n_list_translations`      | 读取单个文件或全项目去重后的翻译详情。                 |
| `ai_i18n_write_translations`     | 批量填充缺失翻译；只接受 `null` 或与目标值相同的条目。 |

MCP 只读写 workspace root 内的 `extracted/**`，不会覆盖不同的非空翻译，也不会直接修改
cache 或 locales。写入后，如果 Vite Dev 正在运行会自动同步；否则在下一次 `vite dev` 或
`vite build` 时完成校准。

所有工具的必填参数、可选参数、默认值与返回结构见 [MCP 工具 API](./mcp/)。
