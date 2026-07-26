# Phase 6 TODO

- [x] 扩展共享静态求值器：对象、数组、成员、spread、拼接、逻辑与有限候选。
- [x] 为 1000/1001 静态候选边界添加回归测试；Vite 不设上限，ESLint 默认警告阈值为 1000 且可配置。
- [x] 实现无导入 `defineI18nMessages()` 识别、直接调用约束与本地 binding 遮蔽。
- [x] 在 Vite 普通源码、Vue SFC、SSR transform 与 Vitest 中消除宏。
- [x] 为所有框架模式生成宏的全局 TypeScript 声明。
- [x] 将“可提取”与“推荐写法”拆成独立诊断。
- [x] 扩展 ESLint 对拼接、逻辑表达式、`let`、未标记成员和非推荐调用来源的检查。
- [x] 增加 Analyzer、Vite、Vue、Vitest 与 ESLint 测试。
- [x] 更新用户文档、包 README 与 Agent skills。
- [x] 运行仓库全量 build、test、check 并记录验收证据。
