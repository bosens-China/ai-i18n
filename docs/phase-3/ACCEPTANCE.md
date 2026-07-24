# Phase 3 验收证据

## 自动化测试

- Core schema 覆盖 cache v1 到 v2 迁移。
- FileStore 覆盖 source locale 排除、扁平文件名碰撞和 source language 反向复用。
- React runtime 覆盖按 `t` 函数引用缓存翻译结果的场景。
- MCP 覆盖 cache v2 下的查询与原子写回。

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
- [x] extracted 文件迁移到 `src_components_layout_SettingsModal.tsx.json`
      等单层文件名。
- [x] cache 升级为 v2，只包含 `version` 与 `messages`。
