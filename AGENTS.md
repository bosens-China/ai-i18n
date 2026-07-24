# Agents

这个是一个vite8+的ai插件

以下为具体要求：

- 内部需求、TODO、验收与 Spike：**先读 [`docs/index.md`](./docs/index.md)**，再按索引打开对应文件；有变化需同步更新该索引与正文
- 面向用户的文档在 `apps/docs`（Astro Starlight）；产品行为、接入流程或 MCP 契约变化时，必须同步更新用户文档
- 重要模块涵盖测试，但是无关紧要的不需要书写避免测试膨胀，例如文案之类的，测试框架用vitest
- 测试文件放到当前目录下的test文件夹下
- 重点部分添加注释，注释用中文
- 确保代码行数尽量不超过400行，超出考虑拆分
- 代码修改结束后记得允许eslint和ts检查，更改多个文件的时候考虑运行测试用例
- 当项目规则、MCP 工具契约、Vite 配置方式或 Vue、React、Vanilla 接入流程发生变化时，必须同步检查并更新 `.agents/skills/use-ai-i18n-mcp` 与 `.agents/skills/integrate-ai-i18n`
- 使用pnpm请尊重本机版本
