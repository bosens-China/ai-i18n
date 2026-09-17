# ai-i18n Agent 注册与插件安装

本参考供 Agent 执行 Skill 安装、MCP 注册与 Codex 插件安装。先识别用户宿主和已授权范围，
保留已有配置；普通 AI 翻译 Provider 接入转交 `integrate-ai-i18n`。

---

开始前，请先在目标 Vite 应用中完成 ai-i18n 接入。Skill 可以从应用入口扫描文案，
覆盖尚未访问的懒加载页面，无需为了补译先运行一次完整 `vite build`。

使用 Codex 时，可以选择[安装 Agent 插件](#通过-agent-插件使用)，一次加载 Skill、MCP 和任务结束检查；
也可以按下文单独安装 Skill，再按需注册 MCP。插件已携带这两份 Skill，无需重复安装。

## 安装 Skill

推荐在项目根目录安装 ai-i18n 提供的 Skill：

```sh
npx skills add bosens-China/ai-i18n --skill use-ai-i18n-mcp integrate-ai-i18n -y
```

安装后，你可以直接让 Agent 执行以下任务：

- “使用 `integrate-ai-i18n` 检查这个 Vite 应用的接入。”
- “使用 `use-ai-i18n-mcp` 补齐缺失的英文翻译，不要覆盖已有译文。”

Skill 会引导 Agent 选择正确的 Vite 应用，并区分自动译文与人工校对结果。

## 只使用 Skill

普通补译可以只安装 Skill，并在目标应用安装 `@ai-i18n/mcp@alpha` 作为开发依赖。
Agent 会使用 Skill 自带的脚本扫描、读取缺译、保存译文并复查，无需在编码工具中注册 MCP，
也无需配置 OpenAI Provider。使用项目已有包管理器安装依赖即可。

扫描沿应用入口、静态依赖、懒加载和可展开的 glob 查找文案，使用应用已有的 Vite 配置与框架插件。
它会刷新文案清单，保留历史译文，不请求 Provider、不生成生产包。遇到无法解析的模块或动态路径时，
Agent 会报告问题，不会把部分扫描结果当成完整清单。HTML 内联脚本中的翻译调用需要先移到
独立 JS/TS 文件；静态 HTML 文本仍按现有 `html` 配置提取。

扫描使用开发环境的转换流程；只在 Build 阶段生成的页面或仅运行时才能确定的路由，仍需单独验证。
生产集成验证和孤立译文清理仍需要完整 Build。运行中的 Dev 会统一处理扫描，不需要为了补译关闭 Dev。
源码和清单未变化时自动复用提取结果，但缺译数量始终按最新译文重新计算。不要同时执行同目录的 Build 或历史清理。

已连接 MCP 时，Agent 在扫描后直接调用工具补译。人工覆盖、清空译文与孤立清理使用下面的 MCP 接入。

## 注册 MCP 服务器

ai-i18n 支持 Codex、Cursor、Claude Code 和 Antigravity。请在所使用的 AI 编码工具中注册
`@ai-i18n/mcp`。以下命令和配置以当前 alpha 版本为例。

### Codex

在本机终端运行以下命令即可注册：

```sh
codex mcp add ai-i18n -- npx -y @ai-i18n/mcp@alpha
```

也可以在 `~/.codex/config.toml` 或项目的 `.codex/config.toml` 中加入：

```toml
[mcp_servers.ai_i18n]
command = "npx"
args = ["-y", "@ai-i18n/mcp@alpha"]
```

也可以在 Codex 桌面端依次打开 **Settings → MCP servers → Add server → STDIO**，填写相同的
`command` 和 `args`。

### Cursor

在项目的 `.cursor/mcp.json` 或全局 `~/.cursor/mcp.json` 中加入：

```json
{
  "mcpServers": {
    "ai-i18n": {
      "command": "npx",
      "args": ["-y", "@ai-i18n/mcp@alpha"]
    }
  }
}
```

### Claude Code

```sh
claude mcp add --transport stdio --scope local ai-i18n -- npx -y @ai-i18n/mcp@alpha
```

### Antigravity

在项目的 `.agents/mcp_config.json` 中加入以下内容。若希望所有项目共用，可改为全局
`~/.gemini/config/mcp_config.json`：

```json
{
  "mcpServers": {
    "ai-i18n": {
      "command": "npx",
      "args": ["-y", "@ai-i18n/mcp@alpha"]
    }
  }
}
```

在 Antigravity IDE 中，也可以从 Agent 面板的 **MCP Servers → Manage MCP Servers → View raw config**
打开同一份配置。当前 ai-i18n 未收录在 Antigravity MCP Store，因此需要添加自定义服务器配置。

Cursor 和 Antigravity 对自定义本地 STDIO 服务器均使用配置文件。它们的 MCP Store 一键安装仅适用于
已收录的服务器；ai-i18n 收录前，请使用本页配置。

## 推荐提示词

完成配置后，将下面的提示发给 Agent：

> 使用 use-ai-i18n-mcp 补齐当前 Vite 应用缺失的英文翻译。
> 不要覆盖已有译文；需要人工确认时，请先列出建议措辞。

## 使用边界

- 在 Monorepo 中，请在提示中说明目标应用名称或目录。
- 默认补齐缺失译文；需要修改已有译文时，请明确要求校对或覆盖。
- 人工译文优先于自动译文。对措辞有疑问时，应先确认再保存。
- Agent 工作期间不要并行编辑同一份译文文件。
- 清理孤立译文属于单独操作，必须明确提出并审查结果。

生成文件与提交规则见产品文档的 **生成文件与 Git**页面。

## 通过 Agent 插件使用

插件仅支持 Codex，不支持 Cursor、Claude Code 或 Antigravity。其他宿主使用上面的独立 Skill / MCP 流程，
不要为它们生成插件目录或承诺自动结束检查。

### 安装与验证

1. 确认用户要求安装插件，目标为 Codex，且 CLI 提供 `plugin` 命令。
2. 从已发布的市场分支安装，不克隆 `main`、不要求用户构建源码、不用 Release zip：

   ```sh
   codex plugin marketplace add bosens-China/ai-i18n --ref plugin-marketplace
   codex plugin add ai-i18n@ai-i18n
   codex plugin list
   ```

3. 按宿主提示启用并信任 Hook，开始新任务，确认 `integrate-ai-i18n`、`use-ai-i18n-mcp` 和 MCP 可用。
   检查同名 MCP 和独立 Skill 的重复副本；保留有效配置，不擅自删除用户配置。
4. 核对应用安装的 `@ai-i18n/vite/internal/scan`；仅使用 Skill 补译时，还需要
   `@ai-i18n/mcp/internal/agent`。缺少能力时报告版本不匹配，不修改 `node_modules` 或静默升级依赖。
5. 目标应用选择、自动继续上限及写入授权按 SKILL.md 直接链接的 `plugin-hooks.md` 执行。
   安装成功不代表扫描或补译已成功；显式扫描后复查剩余缺译。

市场不可用或 CLI 不支持插件命令时，报告具体失败，可使用独立 Skill / MCP，
不要把源码目录或 zip 当成等价安装方式。结构测试不能替代宿主实际安装验证。

### 更新

```sh
codex plugin marketplace upgrade ai-i18n
codex plugin add ai-i18n@ai-i18n
```

刷新市场后更新安装副本，必要时重新信任 Hook，并开始新任务验证。
Skill 与脚本随插件更新；应用 npm 依赖独立管理，不随着插件静默升级。

官方格式与安装边界见 [Codex 插件文档](https://developers.openai.com/plugins/build/plugins)。
