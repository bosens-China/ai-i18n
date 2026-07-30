# 内部文档索引

面向 Agent 与维护者。先读本文件，再按任务打开对应的现行文档。

## 权威顺序

1. [用户文档](../apps/docs/docs/index.md)：公开 API、配置、接入流程与产品行为。
2. 各 packages/*/README.md：包级安装、运行和开发者配置；MCP 工具契约以
   [packages/mcp/README.md](../packages/mcp/README.md) 与源码 schema 为准。
3. [现行产品决策](./PRD.md)：跨模块的设计原因、边界与内部工作规则。
4. [发布与 CI](./release.md)：维护者发布流程。

代码、类型、测试和可执行工作流始终优先于说明性文档。

## 进行中需求

当前没有进行中的需求文档。新需求在 `docs/work/<feature-name>/` 下创建 `PRD.md` 与
`TODO.md`：

- PRD 只记录待确认或待实现的目标、决策和边界。
- TODO 只保留未完成事项。
- 完成后，将仍然有效的长期决策合并到 [PRD.md](./PRD.md)，再删除该工作目录。
- PRD 不得超过 400 个物理行。达到 400 行时使用 file-line-audit Skill 审查；超过上限时按主题拆分。总 PRD 的主题文件放在 `docs/prd/`，根 `docs/PRD.md` 保持索引与跨主题决策。

已完成的 TODO、验收记录、Phase PRD 与 Spike 不保留在工作树中；需要追溯时使用 Git 历史。
