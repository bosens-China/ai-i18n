# Phase 10 验收

状态：Passed。

## 验收项

- 模块初始化时保存 `t()` 结果会收到 warning，延迟执行函数与 getter 不误报。
- Vue `<script setup>`、直接导出的 options，以及 `.vue` / `.ts` / `.tsx` 中导入的
  `defineComponent()` 对象或函数签名里保存、直接返回的一次性译文快照会被报告；普通
  对象同名方法和本地同名 `defineComponent` 不误报。
- Vue / React JSX、TSX 渲染路径中的 Runtime 顶层 `t` 会收到 warning。
- Vue template 中绑定到 Runtime 顶层 `t` 的调用会收到 warning；`vue-auto-import` 下
  裸 template-only `t` 会收到 error。
- `useI18n()` 派生 `t`、事件回调、其他 i18n 库和局部同名 binding 不误报。
- React Compiler 的 annotation 构建成功，并保留 Hook 的 Runtime 订阅与可失效 `t` 引用。
- 两条规则复用同一文件中配置与候选上限兼容的 Analyzer 结果，诊断支持中英文。
- 规则独立启用时仍报告分析失败，官方 preset 同一文件只报告一次。
- 显式导入 preset 不声明 Runtime 全局，三种 `*-auto-import` preset 与 Vite 模式 API
  一一对应。
- 文档明确静态提取与响应式刷新是两个独立问题，并列出第一版数据流边界。

## 验证结果

- `pnpm test`：43 个测试文件、348 个测试全部通过。
- `pnpm check`：构建、publint、类型入口检查、TypeScript、ESLint、示例和文档检查全部通过。
- `pnpm --filter @ai-i18n/docs build`：Rspress 文档站及 Markdown 产物构建通过。
- React Compiler 行为测试使用 annotation 模式真实编译，验证语言切换后文案从“标题”更新为
  “Title”，并确认 Compiler cache 被执行。
