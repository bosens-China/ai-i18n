# Agents

这个是一个vite8+的ai插件

以下为具体要求：

- 内部需求与产品决策：**先读 [`docs/index.md`](./docs/index.md)**，再按索引打开对应文件；现行跨模块决策维护在 [`docs/PRD.md`](./docs/PRD.md)。进行中需求仅在 `docs/work/<feature-name>/` 创建 PRD/TODO；完成后将长期决策回填总 PRD 并删除工作目录。有变化需同步更新索引与正文
- PRD 文档行数：总 PRD 与进行中需求 PRD 均不得超过 400 个物理行。达到 400 行时使用 `file-line-audit` Skill 审查；超过 400 行必须按主题拆分，不得创建按序号切分的 part 文件。总 PRD 的主题文件放在 `docs/prd/<topic>.md`，根 `docs/PRD.md` 保持索引与跨主题决策；进行中需求使用各自的 `prd/` 子目录
- `apps/docs`（Rspress）面向应用开发者，以用户如何接入、配置、使用和排障为中心。只介绍用户理解产品行为所需的概念，不暴露 Agent 专用工具字段、执行协议和内部实现细节。
- `.agents/skills` 面向 AI Agent，以 Agent 如何完成任务为中心。应明确目标选择、默认决策、工具契约、操作与写入边界、用户授权要求、验证步骤和错误恢复，不按面向用户的教程方式铺陈背景知识。
- 产品行为、接入流程或 MCP 契约变化时，必须同时检查 `apps/docs` 与相关 Skill。两者同步同一事实，但按各自受众重新组织内容，不互相复制：用户文档说明“如何使用”，Skill 说明“Agent 如何执行”。
- 对外 Skill 的 `SKILL.md` 只保留触发条件、默认决策、核心流程和引用路由；详细契约、框架差异与错误恢复放在由 `SKILL.md` 直接链接的一级 `references/*.md` 中。每条规则只保留一个权威位置，不创建多层引用。
- 重要模块涵盖测试，但是无关紧要的不需要书写避免测试膨胀，例如文案之类的，测试框架用vitest
- 测试文件放到当前目录下的test文件夹下
- `packages/eslint` 的规则按 `src/rules/common`、`src/rules/vue` 和 `src/rules/react` 划分；测试放在被测源码同级的 `test/` 子目录，例如 `utils/fs.ts` 对应 `utils/test/fs.test.ts`
- 重点部分添加注释，注释用中文
- 插件、ESLint 等面向开发者的提示、警告与报错文案必须适配中英文国际化，不得新增仅支持单一语言的消息
- 确保代码行数尽量不超过400行，超出考虑拆分
- 代码修改结束后记得允许eslint和ts检查，更改多个文件的时候考虑运行测试用例
- 当项目规则、MCP 工具契约、Vite 配置方式或 Vue、React、Vanilla 接入流程发生变化时，必须同步检查并更新 `.agents/skills/use-ai-i18n-mcp` 与 `.agents/skills/integrate-ai-i18n`
- 使用pnpm请尊重本机版本
- git 提交的消息前缀需要注意遵守 `googleapis/release-please-action` 要求，避免发布版本的版本号不对或者不会触发pr
