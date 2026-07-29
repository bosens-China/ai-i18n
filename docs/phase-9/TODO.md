# Phase 9 TODO

- [x] 修复 `definePage`、`raw`、`url` 派生 query 与外部 script 的 Vue 转换边界。
- [x] 通过宿主 Vue compiler-sfc 支持 imported props / emits 类型。
- [x] 为 Vue / React 自动导入增加顶层 `t`，并统一 Vite、Vitest、声明与
      `*-auto-import` ESLint 契约。
- [x] 增加 `LangLoadState`、`getLangLoadState()` 与框架派生状态。
- [x] 覆盖并发切换、初始懒加载、失败与过期请求状态测试。
- [x] 优化 ESLint 同文件规则分析、tsconfig 与路径探测缓存，并增加非计时回归测试。
- [x] 更新用户文档与内部接入 Skill。
- [x] 运行相关 Vitest、TypeScript、ESLint、构建和文档检查。
