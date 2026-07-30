# Phase 13 验收

状态：Passed。

## 验收项

- 未配置 `tsconfigPath` 时，`@/*` alias 导入的 `defineI18nMessages()` 成员和动态索引可被
  ESLint 静态追踪。
- solution config 的直接和嵌套 `references` 均可发现。
- 多项目仓库按 importer 的 `files`、`include`、`exclude` 选择正确配置。
- `extends` 中继承的 `paths` 可解析，Vue SFC 服从显式 include 与 exclude。
- Vue template 对导入文案生成的 `unref()` 包装不影响宏成员、动态索引或整树静态分析。
- 手动 `tsconfigPath` 可指向非标准文件或 solution config。
- TypeScript 5/6 的无 `baseUrl` paths、`baseUrl + paths` 与 bare lookup 行为保持兼容。
- Vite resolver 行为、Runtime、提取协议和 MCP 契约不变。

## 验证结果

- Vue、React demo 的独立 `lint`、类型检查和 Vite 8.1.5 production Build 均通过；新增
  三条跨文件文案正确进入各自 `translations.json`。
- `pnpm --filter @ai-i18n/eslint-plugin test`：8 个测试文件、163 个测试全部通过。
- `pnpm test`：46 个测试文件、397 个测试全部通过。
- `pnpm check`：构建、publint、类型入口检查、TypeScript、ESLint 与三套示例检查全部通过。
- `pnpm --filter @ai-i18n/docs build`：Rspress HTML、Markdown 与 LLM 索引构建通过；构建结束
  后仅报告一次不影响退出状态的本地 Rspack 持久缓存写入 warning。
