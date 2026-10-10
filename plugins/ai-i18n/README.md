# ai-i18n Codex 插件

同一份插件提供接入与补译 Skill、MCP 配置，以及最多允许一次自动继续的任务结束检查。
它不升级应用里的 npm 依赖，不复制 Skill 到应用仓库，也不替代生产构建。

插件仅支持 Codex，不支持 Cursor、Claude Code 或 Antigravity；其他工具可独立使用 Skill 与 MCP。
CI 把可安装快照推到 `plugin-marketplace` 分支；不要把 `main`
上的 `plugins/ai-i18n` 源码目录直接安装。Skill 源码统一维护在 `.agents/skills` 中，打包时随插件分发。

```sh
codex plugin marketplace add bosens-China/ai-i18n --ref plugin-marketplace
codex plugin add ai-i18n@ai-i18n
```

按宿主提示启用并信任 Hook，然后开始新任务。更新后运行
`codex plugin marketplace upgrade ai-i18n`，再运行 `codex plugin add ai-i18n@ai-i18n`
更新安装副本；如 Hook 有变更则重新信任，并开始新任务。
应用开发者安装步骤见
[AI Agent 接入](https://bosens-china.github.io/ai-i18n/guide/ai/ai-tools#安装-codex-插件)。

项目必须安装支持 `@ai-i18n/vite/internal/scan` 的版本；仅使用 Skill 补译时，还需要匹配的
`@ai-i18n/mcp/internal/agent`。MCP 启动配置固定为打包时的 `@ai-i18n/mcp` 版本；
若已连接同名 MCP，可关闭重复连接。

维护者本地调试可运行 `pnpm plugins:build`。Codex 市场目录在
`dist/codex-marketplace/`，包含 `.agents/plugins/marketplace.json` 和完整的
`plugins/ai-i18n/`（清单、Skill、MCP 和 Hook）；不要把生成物提交进 `main`。

安装范围由宿主决定，可以全局安装；每次检查只针对当前应用。
若工作区根目录不是目标应用的命令执行目录，请在启动 Codex 前设置 `AI_I18N_APP_ROOT`。
该变量的值为目标应用的绝对路径。需要非默认配置或运行模式时，同时设置 `AI_I18N_CONFIG` 和 `AI_I18N_MODE`。
应用显式指定配置加载器时，用 `AI_I18N_CONFIG_LOADER` 沿用 `bundle`、`runner` 或 `native`。
未明确应用或目录未直接声明 `@ai-i18n/vite` 时跳过，不会自动选择 Monorepo 中的子应用。

## 实际流程

任务正常结束 → 检查所选应用 → 入口扫描或复用有效清单 → 读取当前缺译数量 →
有缺译/扫描失败则反馈给当前 Agent 一次 → Agent 按当前任务授权执行 Skill → 查询验证并报告。
检查本身不调用翻译模型、不保存人工覆盖、不清理历史；中止、错误结束和自动继续后的第二次检查不阻塞结束。
扫描失败不是“零缺译”。需要覆盖既有译文、改变人工校对或删除历史时，继续遵守 Skill 的授权边界。

无活动 Dev 时扫描建立临时 Vite 转换实例；已有活动 Dev 时请求该进程扫描，避免争写同一目录。
扫描会更新提取清单和缺译槽位，因此首次启用 Hook 时应信任当前工作区及其 Vite 配置。
缓存位于 Vite `cacheDir`，删除后自动重建。自定义转换插件等无法证明输入稳定的情形保守重扫。

已于 2026-09-17 核对 [Codex 插件文档](https://developers.openai.com/plugins/build/plugins)
和 [Hook 文档](https://learn.chatgpt.com/docs/hooks)。产物结构和脚本已通过自动化测试，
尚未完成 Codex 中的实际安装验证。
