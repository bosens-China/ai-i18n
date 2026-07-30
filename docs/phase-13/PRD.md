# Phase 13：ESLint tsconfig 项目解析

状态：Passed。

## 背景

Analyzer 支持跨文件静态文案，但 ESLint 过去只有显式传入 `tsconfigPath` 时才能解析
TypeScript `paths`。采用 `@/*` alias 的项目因此会把本可静态追踪的
`defineI18nMessages()` 成员和动态索引误判为动态参数。

## 自动发现与项目选择

- 每个 importer 默认从所在目录向上寻找最近的 `tsconfig.json`。
- 解析 JSONC 与 `extends`，递归读取 solution config 的 `references`。
- referenced project 按声明顺序检查，并用 `files`、`include`、`exclude` 判断 importer
  是否属于该项目；没有匹配时再检查根配置。
- Vue SFC 只有被 `files` 或带 `.vue` 的 `include` 显式包含时才属于项目，并继续服从
  `exclude`。
- Vue template 编译生成的 `unref(importedMessages)` 包装在提取与推荐语法校验中保持一致，
  跨文件宏成员、动态索引和整树调用均继续追踪原始 import。
- `tsconfigPath` 保留为手动覆盖发现入口；相对路径以 ESLint 进程工作目录为基准，指向
  solution config 时仍递归选择项目。
- 配置和解析结果使用有界短期缓存；配置文件或源码目录变化后重新探测。

## TypeScript 版本边界

- TypeScript 5.x 与 6.x 的 `paths` target 在没有 `baseUrl` 时相对声明它的 tsconfig。
- 现有 `baseUrl + paths` 与 bare-specifier lookup 在 TypeScript 6 编译器中仍会执行，
  但会报告弃用诊断。
- TypeScript 7 将不再支持 `baseUrl`；新配置推荐省略它并使用
  `"paths": { "@/*": ["./src/*"] }`，依赖旧 bare lookup 的项目改用显式
  `"*": ["./src/*"]`。

## Vite 边界

- Vite 插件继续通过 Vite plugin context 的 `resolve()` 解析依赖，因此尊重最终
  `resolve.alias`、Vite 8 `resolve.tsconfigPaths` 和已注册的 resolver plugin。
- ESLint 不加载或执行 Vite 配置，只自动解析 TypeScript 项目；仅写在 Vite
  `resolve.alias` 中的 alias 需要同步到 tsconfig `paths`。
- 本阶段不改变 Vite 插件配置、提取协议、Runtime 或 MCP 契约。

## 示例工程

- Vue 与 React demo 都通过根 `tsconfig.json` 的 `references` 选择 `tsconfig.app.json`。
- 两个 app config 都使用无 `baseUrl` 的 `"@/*": ["./src/*"]`，Vite 开启
  `resolve.tsconfigPaths`，ESLint 不传 `tsconfigPath`。
- 示例从 `@/messages` 导入 `defineI18nMessages()` 集合，并同时渲染成员与动态索引。
