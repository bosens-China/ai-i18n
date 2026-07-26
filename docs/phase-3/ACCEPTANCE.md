# Phase 3 验收证据

> 本文仅保存 Phase 3 当时的验收证据，不定义当前协议。现行持久化、诊断和 MCP 契约分别见
> [Phase 7](../phase-7/PRD.md)、[Phase 8](../phase-8/PRD.md) 与
> [`docs/mcp/PRD.md`](../mcp/PRD.md)。

## 后续自动化回归

- 现行 Core schema 覆盖 Translation Memory 的严格校验。
- FileStore 覆盖 source locale 排除、扁平文件名碰撞和 source language 反向复用。
- React runtime 覆盖按 `t` 函数引用缓存翻译结果的场景。
- 现行 MCP 覆盖 Translation Memory 的查询与原子写回。

最终质量命令：

```sh
pnpm check
pnpm test
pnpm build
```

2026-07-24 执行结果：

- `pnpm check` 通过，包括构建、TypeScript、ESLint、publint 与 attw。
- `pnpm test` 通过：24 个测试文件、171 条测试。
- `pnpm docs:build` 通过：3 个示例与 14 个文档页面构建成功。

## 外部验收

DropRoom 使用 React 19、React Compiler 与 Vite 8。已用本地构建和临时 i18n
副本完成验收，没有改写 DropRoom 工作区：

- [x] 切换为 English 后，首页、设置弹窗和设置入口同时更新。
- [x] `locales/zh-CN.json` 被清理，只保留 `en-US.json`。
- [x] extracted 使用 `src_components_layout_SettingsModal.tsx.json` 等单层文件名。
- [x] Translation Memory 不再保存可由 extracted 与 ProjectState 推导的 file records。
