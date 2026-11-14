# Agent 插件与清单新鲜度

- Agent 插件携带 `integrate-ai-i18n`、`use-ai-i18n-mcp` 两份 Skill、扫描辅助脚本和 MCP 配置。Skill 源码统一维护在 `.agents/skills`，插件清单位于 `.agents/plugins/marketplace.json`。
- 插件仅支持 Codex；其他宿主使用独立 Skill 与 MCP。应用 npm 依赖和插件分别更新。发布前核实插件指定的 MCP 版本已在 npm 发布；流程见[发布与 CI](../release.md)。
- 正常结束检查仅针对明确目标应用，缺译或检查失败反馈给当前 Agent 一次，按当前任务授权处理；不独立覆盖已有人工译文或删除历史。宿主加载与 Hook 信任遵循宿主要求。
- 显式扫描用目标应用的 Vite 配置遍历入口可达源码，在成功后替换当前工作树 SQLite 活动索引并生成 locales。失败保留上一份有效索引。Dev 不自动扫描全量文案、调用适配器或持久化翻译结果。
- 扫描可以复用未变化的源分析，但校验必须覆盖配置、环境和入口图；无法证明新鲜时重新扫描。SQLite 是可重建本地索引，不跨进程或工作树共享。
- Review 当前页优先使用已访问模块；全量页显式扫描。人工保存只更新 manual JSON，最终资源须重新扫描或 Build 才更新。

## 权威入口

- [MCP 工具契约](../../.agents/skills/use-ai-i18n-mcp/references/tool-contracts.md)
- [应用开发者的校对流程](../../apps/docs/docs/guide/basic/translation-review.md)
- [插件产物与宿主安装边界](../../plugins/ai-i18n/README.md)
