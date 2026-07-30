# Phase 13 TODO

- [x] 默认发现 importer 最近的 `tsconfig.json`。
- [x] 解析 `extends` 并递归读取 `references`。
- [x] 按 `files`、`include`、`exclude` 选择实际项目并覆盖 Vue SFC。
- [x] 保留 `tsconfigPath` 作为自动发现入口的手动覆盖。
- [x] 兼容 TypeScript 5/6 的无 `baseUrl` paths 与既有 `baseUrl` 行为。
- [x] 覆盖 alias 成员、动态索引、嵌套引用、配置继承与缓存刷新测试。
- [x] 修复 Vue template 对 imported messages 生成 `unref()` 后的推荐语法校验。
- [x] 在 Vue、React demo 中用真实 references、`@/*` 和 Vite Build 验证完整链路。
- [x] 更新用户文档、包 README、内部索引与接入 Skill。
- [x] 运行完整 Vitest、TypeScript、ESLint、构建与文档站验收。
