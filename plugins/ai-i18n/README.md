# ai-i18n Agent 插件

同一份插件提供接入与补译 Skills、MCP 配置，以及一次自动继续的结束检查。
它不升级应用里的 npm 依赖，不复制 Skills 到应用仓库，也不替代生产 Build。

在本仓库运行 `pnpm plugins:build`，产物位于 `dist/agent-plugins/<host>/ai-i18n/`。
源码只维护 `.agents/skills` 中的两份 Skill；打包时随插件携带，更新插件即可更新它们。
项目必须安装支持 `@ai-i18n/vite/internal/scan` 的版本；Skill-only 补译还需要匹配的
`@ai-i18n/mcp/internal/agent`。内部能力尚未发布时请使用本仓库构建包，不能把旧版本当作兼容。
MCP 启动配置固定为打包时仓库 MCP 版本；若已连接同名 MCP，可关闭重复连接。

## 安装与更新

当前使用本地产物安装，尚未提供市场一键安装入口。完整的复制命令、Codex 个人目录配置、
各平台重新加载与升级步骤见[应用开发者安装指南](../../apps/docs/docs/guide/advanced/ai-tools.mdx#通过-agent-插件使用)。
请安装构建后的完整目录；源码目录本身没有携带打包后的 Skills。

- **Codex**：将 `codex/ai-i18n` 产物加入个人 marketplace，再用 `codex plugin add` 安装。Hook 需按宿主提示信任并启用；
  插件更新后重新信任变更的 Hook，并开始新任务加载更新后的 Skill。
- **Cursor**：将 `cursor/ai-i18n` 复制到 `~/.cursor/plugins/local/ai-i18n`，重新加载窗口。结束检查只对 `completed` 生效，
  `loop_limit: 1` 防止反复自动继续。
- **Antigravity 2.0**：将 `antigravity/ai-i18n` 放进 `~/.gemini/config/plugins/`，
  或目标 workspace 的 `.agents/plugins/`。在最终安装位置运行
  `node <插件目录>/scripts/configure-antigravity.mjs`，生成指向本机 Node 和插件脚本的 `hooks.json`。
  移动插件或升级 Node 后重跑此命令。该适配只在首次 `executionNum: 1` 且 `fullyIdle: true` 的正常结束检查；
  后续 execution 使用 Skill 主动收尾，不能宣称每一轮都有自动检查。CLI/IDE 扩展未作宿主实测。

安装范围由宿主决定，可以全局安装；每次检查只针对当前应用。
若 workspace 根目录不是目标应用的命令目录，在启动宿主前设置 `AI_I18N_APP_ROOT` 为绝对应用路径；
需要非默认配置或 mode 时同时设置 `AI_I18N_CONFIG`、`AI_I18N_MODE`。
未明确应用或目录未直接声明 `@ai-i18n/vite` 时跳过，不猜选 monorepo 中的子应用。

## 实际流程

任务正常结束 → 检查所选应用 → 入口扫描或复用有效清单 → 读取当前缺译数量 →
有缺译/扫描失败则反馈给当前 Agent 一次 → Agent 按当前任务授权执行 Skill → 查询验证并报告。
检查本身不调用翻译模型、不保存人工覆盖、不清理历史；中止、错误结束和自动继续后的第二次检查不阻塞结束。
扫描失败不是“零缺译”。需要覆盖既有译文、改变人工校对或删除历史时，继续遵守 Skill 的授权边界。

无活动 Dev 时扫描建立临时 Vite 转换实例；已有活动 Dev 时请求该进程扫描，避免争写同一目录。
扫描会更新提取清单和缺译槽位，因此首次启用 Hook 时应信任当前 workspace 及其 Vite 配置。
缓存位于 Vite `cacheDir`，删除后自动重建。自定义转换插件等无法证明输入稳定的情形保守重扫。

官方契约核对于 2026-09-17；产物结构与脚本有自动化测试，未冒充三种宿主的安装实测：
[Codex Hooks](https://developers.openai.com/codex/hooks)、
[Cursor Hooks](https://cursor.com/docs/hooks)、
[Antigravity Plugins](https://www.antigravity.google/docs/plugins)、
[Antigravity Hooks](https://www.antigravity.google/docs/hooks)。
