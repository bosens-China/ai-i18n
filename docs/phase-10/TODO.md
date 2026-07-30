# Phase 10 TODO

- [x] Analyzer 区分 Runtime 顶层 `t` 与 `useI18n()` 派生 `t`。
- [x] 实现 `no-eager-translation` 与模块、`<script setup>`、组件 `setup()`、TS/TSX
      `defineComponent()` 快照测试矩阵。
- [x] 实现 `no-unsubscribed-t` 与 Vue / React JSX、事件、即时日志、未知调用及 shadow
      测试矩阵。
- [x] 覆盖 Vue template Runtime 顶层 `t` 与自动导入模式下的裸 template-only `t`。
- [x] 保证规则独立启用时报告分析失败，官方 preset 同一文件不重复提示。
- [x] 将规则加入显式导入与三种框架自动导入的适用 preset。
- [x] 新增可选的 `no-redundant-auto-import`，精确匹配框架 API 集合并提供安全自动修复。
- [x] 用真实 React Compiler 构建验证 Hook 订阅链路。
- [x] 更新用户文档、包 README 与接入 Skill。
- [x] 运行完整 Vitest、TypeScript、ESLint、构建和文档检查。
