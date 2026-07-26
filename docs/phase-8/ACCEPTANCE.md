# Phase 8 验收

状态：Implemented，验证通过。

## 验收项

- 中国大陆时区在自动模式下显示中文，其他时区显示英文。
- `AI_I18N_DIAGNOSTIC_LOCALE` 可以覆盖时区结果，非法值会在解析诊断语言时报错。
- ESLint 与 Vite 对共享 Analyzer 诊断使用相同语言。
- 语言切换不改变诊断 code、ESLint `messageId`、severity 或源码位置。
- 浏览器 Runtime、MCP 契约与协议文件内容不受影响。

## 验证结果

- `pnpm build`：通过，所有发布入口通过 publint 与 Are the Types Wrong 检查。
- `pnpm test`：29 个测试文件、241 项测试全部通过。
- `pnpm check`：根配置、全部包、文档站与三个示例的 TypeScript 和 ESLint 检查全部通过。
