# ai-i18n Agent 注册与插件安装

本参考面向直接使用 Cursor、Codex、Claude Code 或 Antigravity 的开发者。应用开发者不需要
在业务代码中配置以下内容；普通 AI 翻译接入请阅读产品文档的 **AI 翻译**页面。

---

开始前，请先在目标 Vite 应用中完成 ai-i18n 接入。Skill 可以从应用入口扫描文案，
覆盖尚未访问的懒加载页面，无需为了补译先运行一次完整 `vite build`。

你可以选择[安装 Agent 插件](#通过-agent-插件使用)，一次加载 Skills、MCP 和任务结束检查；
也可以按下文单独安装 Skills，再按需注册 MCP。插件已携带这两份 Skills，无需重复安装。

## 安装 Skills

推荐在项目根目录安装 ai-i18n 提供的 Skills：

```sh
npx skills add bosens-China/ai-i18n --skill use-ai-i18n-mcp integrate-ai-i18n -y
```

安装后，你可以直接让 Agent 执行以下任务：

- “使用 `integrate-ai-i18n` 检查这个 Vite 应用的接入。”
- “使用 `use-ai-i18n-mcp` 补齐缺失的英文翻译，不要覆盖已有译文。”

Skills 会引导 Agent 选择正确的 Vite 应用，并区分自动译文与人工校对结果。

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

仓库提供 Codex、Cursor 和 Antigravity 插件打包，携带相同的接入 Skill、补译 Skill 和 MCP 配置。
全局安装后仍只检查当前应用；monorepo 中应先明确目标应用，不会自动遍历所有子项目。

结束检查发现缺译时，会把结果交回当前 Agent 一次，由它按任务授权补译并验证；扫描失败也会报告，
不会把失败当成已全部翻译。Hook 不直接调用模型，不无限重试，也不自动改写人工校对结果。
宿主未启用 Hook 时仍可主动使用 Skill。Antigravity 当前适配只在会话的首次正常执行结束时自动检查，
后续任务需主动要求 Agent 使用 Skill 检查缺译。

### 获取插件

当前提供本地打包安装，尚未提供 ai-i18n 插件市场的一键安装入口。
在 ai-i18n 源码仓库运行以下命令；这是打包插件，不会构建你的业务应用：

```sh
pnpm plugins:build
```

如果还没有源码，请先获取 [ai-i18n 仓库](https://github.com/bosens-China/ai-i18n)，
切换到包含插件功能的版本，再运行上述命令。三个平台分别使用以下产物，安装时需要复制完整目录，
包括以点开头的配置文件；不要直接安装源码中的 `plugins/ai-i18n` 目录。

| 平台            | 打包后的目录                             |
| --------------- | ---------------------------------------- |
| Codex           | `dist/agent-plugins/codex/ai-i18n`       |
| Cursor          | `dist/agent-plugins/cursor/ai-i18n`      |
| Antigravity 2.0 | `dist/agent-plugins/antigravity/ai-i18n` |

目标应用需要安装包含入口扫描能力的 ai-i18n 版本。若这项能力尚未发布，请使用本仓库构建的对应包；
仅安装插件不能让旧版本应用获得扫描能力。以下终端示例适用于 macOS / Linux，均从源码仓库根目录执行。

### 安装到 Codex

先复制到个人插件目录：

```sh
mkdir -p ~/.codex/plugins/ai-i18n ~/.agents/plugins
cp -R dist/agent-plugins/codex/ai-i18n/. ~/.codex/plugins/ai-i18n/
```

创建 `~/.agents/plugins/marketplace.json`，内容如下。如果该文件已经存在，保留原有 `name` 和其他
插件，只把下面的 ai-i18n 条目加入 `plugins` 数组，不要覆盖整份文件。

```json
{
  "name": "ai-i18n-local",
  "plugins": [
    {
      "name": "ai-i18n",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/ai-i18n"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

使用支持插件命令的 Codex CLI 安装：

```sh
codex plugin add ai-i18n@ai-i18n-local
codex plugin list
```

若沿用已有目录配置，把命令中的 `ai-i18n-local` 换成文件实际的 `name`。
个人目录会被自动发现，无需额外执行 `marketplace add`。按宿主提示启用并信任 Hook，然后开始新任务。
本地目录的配置方式见 [Codex 官方插件文档](https://developers.openai.com/plugins/build/plugins#install-a-local-plugin-manually)。

### 安装到 Cursor

复制到 Cursor 的本地插件目录：

```sh
mkdir -p ~/.cursor/plugins/local/ai-i18n
cp -R dist/agent-plugins/cursor/ai-i18n/. ~/.cursor/plugins/local/ai-i18n/
```

重启 Cursor，或执行 **Developer: Reload Window**，在 **Customize** 中检查 Skills 和 MCP。
团队策略需要允许本地插件导入；如果安装了同名市场插件，它会优先于本地副本。
加载规则见 [Cursor 官方插件文档](https://cursor.com/docs/plugins#test-plugins-locally)。

### 安装到 Antigravity

以下示例全局安装到 Antigravity 2.0：

```sh
mkdir -p ~/.gemini/config/plugins/ai-i18n
cp -R dist/agent-plugins/antigravity/ai-i18n/. ~/.gemini/config/plugins/ai-i18n/
node ~/.gemini/config/plugins/ai-i18n/scripts/configure-antigravity.mjs
```

也可以把完整目录放入目标应用的 `.agents/plugins/ai-i18n`，仅供该工作区使用；
随后在这个最终安装位置执行 `node .agents/plugins/ai-i18n/scripts/configure-antigravity.mjs`。
配置脚本会生成 Hook 所需的本机路径，移动插件或更换 Node 安装路径后需要重新运行。
目录规则见 [Antigravity 官方插件文档](https://www.antigravity.google/docs/plugins#2-manually-adding-plugins)。

### 确认启用与选择应用

安装后开启新任务，确认宿主能看到 `integrate-ai-i18n`、`use-ai-i18n-mcp`，并且 MCP 连接成功。
若以前手动注册过同名 MCP，请保留一份有效连接。可先使用本页的补译提示词验证，再检查任务结束后的反馈。
需要自动结束检查时，还需在宿主中启用 Hook，并确保宿主进程能够执行 `node` 和 `npx`。

对于 Monorepo，提示词应明确目标应用；自动结束检查还需要从该应用目录启动宿主，
或者在启动宿主前设置 `AI_I18N_APP_ROOT` 为应用绝对路径。需要指定 Vite 配置或 mode 时，
同时设置 `AI_I18N_CONFIG`、`AI_I18N_MODE`。目录不明确时检查会跳过，不会猜选子应用。

当前已验证打包结构和脚本，尚未完成三个宿主的实际安装验证。宿主未加载插件或不支持 Hook 时，
仍可使用本页的独立 Skills / MCP 方式；不要把没有结束提示当成已经全部翻译。

### 更新插件和 Skills

本地安装不会随着仓库变化自动更新。获取新版源码后重新运行 `pnpm plugins:build`，
用对应平台的新产物替换原插件目录；保留自己的应用选择设置，不要把新目录嵌套进旧目录。

- **Codex**：更新目录后再次运行 `codex plugin add ai-i18n@实际marketplace名称`，重新加载宿主并开始新任务。
  如 Hook 有变更，按宿主提示重新信任。若同版本本地修改未刷新，在安装副本的
  `.codex-plugin/plugin.json` 中将 `version` 的 `+` 后缀替换为新的 `codex.local-时间戳`，再安装。
- **Cursor**：替换目录后执行 **Developer: Reload Window**，确认加载的是本地副本。
- **Antigravity**：替换目录后重新运行 `configure-antigravity.mjs`，重新加载宿主并开启新会话。

Skills 和脚本随插件一起更新；原先独立安装的 Skills 不会被插件更新，切换方式时应移除或停用重复副本。
应用中的 npm 依赖单独管理。若插件提示应用版本缺少扫描能力，更新兼容的应用依赖后再执行。
