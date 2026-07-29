# Phase 11 验收

状态：Passed。

## 验收项

- `tRef('保存')` 返回只读 `ComputedRef<string>`，语言切换后更新。
- tagged template 中的 Vue Ref 插值变化后更新。
- Vue 显式导入、自动导入、生成声明、SSR stub 与 Vitest Runtime 均提供 `tRef`。
- React 与 Vanilla 的 Runtime、自动导入、声明和 ESLint preset 均不暴露 `tRef`。
- `tRef()` 与 `t()` 使用同一套静态 source/options 提取规则。
- setup 中保存 `tRef()` 不触发快照 warning；template / render 中调用会触发生命周期 warning。
- 用户文档明确 `.value`、模板自动解包、Vue-only 边界与禁止渲染期创建。
- MCP 契约不变；skill 说明 `t()` 与 `tRef()` 产生相同协议 message ID。

## 验证结果

- `pnpm test`：43 个测试文件、359 个测试全部通过。
- `pnpm check`：构建、publint、类型入口检查、TypeScript、ESLint、示例和文档检查全部通过。
- `pnpm --filter @ai-i18n/docs build`：Rspress HTML、Markdown 与 LLM 索引构建通过；
  `tRef()` Markdown 页面已检查为有效正文。
