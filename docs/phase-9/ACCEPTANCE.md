# Phase 9 验收

状态：Passed。

## 验收项

- Vue Router `definePage`、Vite `raw` / `url` 派生模块不会进入完整 SFC 编译，外部
  `<script src>` 仍正常分析。
- imported `defineProps<T>()` / `defineEmits<T>()` 能在 Vite 与 ESLint 分析中解析。
- Vue / React 的 `autoImport: true` 同时支持 `useI18n` 与 `t`，生成声明与对应
  `*-auto-import` ESLint preset 一致；显式导入 preset 不掩盖缺失 import。
- `aiI18nVitest()` 复用相同的模式 API 集合与 query 过滤规则。
- 普通 `.js` / `.ts` 模块可以使用顶层 `t`，组件文档保留 `useI18n()` 响应式边界。
- 所有模式都可读取语言加载快照；Vue / React 提供 loading 与 error 派生状态。
- 并发切换遵循 last-call-wins，过期请求不覆盖当前语言或加载状态。
- ESLint 同一文件中配置与候选上限相同的请求复用 Analyzer 结果；超过预检上限时允许按需
  补一次无限制分析。tsconfig 与路径探测有可验证的跨文件缓存。
- 宏声明、自动导入和语言加载文档与实现一致。

## 验证结果

- `pnpm test`：36 个测试文件、274 个测试全部通过。
- `pnpm check`：构建、publint、类型入口检查、TypeScript、ESLint、示例和文档检查全部通过。
- `pnpm --filter @ai-i18n/docs build`：文档站构建通过；新增 Runtime 函数和
  `LangLoadState` API 的 Markdown 产物均正常生成。
