# Phase 1 验收记录

> 更新日期：2026-07-23

## 已通过

- `pnpm check`：根目录及各发布包 / 示例 workspace 的 TypeScript、ESLint 检查通过。
- `pnpm docs:build`：`apps/docs`（Astro Starlight）构建通过。
- `pnpm test`：20 个测试文件、137 个测试通过。
- `pnpm build`：6 个发布包构建通过。
- Workspace 共 10 个子包：6 发布包 + 3 示例 + 1 文档站。
- 三个示例的真实 Vite Build 均通过。
- `pnpm --filter @boses/vite benchmark`：Babel/Yuku 冷分析、热替换、200 模块 Build 图完成
  五轮对比。
- GitHub Actions `Yuku platform admission #1`：提交 `1a68388` 通过 Linux、Windows、macOS
  的 x64/arm64 六个平台矩阵，共 6 个 job，均执行 Yuku 准入测试。

## 关键回归证据

- React/Vue Hook binding 覆盖 JS、TS、JSX、TSX，支持解构 alias 与 `i18n.t()`；普通
  composable/custom Hook 和 Vue 外部 `<script src>` 已通过真实 Vite Build 回归。
- Vite 与 ESLint 共同消费 `@boses/analyzer`；成员调用、`undefined` comment、动态参数和
  unresolved 诊断不再各自维护，Vue SFC 也共用 compiler-sfc 分析与 source map。
- 无框架插件时默认 Vanilla；Vue/React 官方插件名可自动推断模式，两种插件族同时存在会
  拒绝启动，显式 `framework` 可覆盖单一推断。
- 检测到 `unplugin-auto-import` 时会启用内部按需注入，显式 `autoImport: true/false`
  可双向覆盖；显式 `virtual:ai-i18n` import 始终保留。
- Vanilla、Vue、React 生成声明均带有 noformat、ts-nocheck 与 eslint-disable 标记，
  并已通过 Prettier、ESLint、TypeScript 与真实 Vite Build 回归。
- Vue SFC、Vue JSX/TSX、React JSX/TSX 以及普通 JS/TS Hook 均已通过真实 Vite Build 验证。
- Vue SFC 使用 compiler-sfc 合并 script/setup 与 inline template，再用 source map 回到 SFC
  原始位置；模板 alias、局部 shadow 和双 script 作用域已覆盖。
- `undefined` comment 按省略处理；未解析静态依赖在保持 pending 的同时输出带位置 warning。
- JS/TS 词法遮蔽、`.mjs/.mts`、CommonJS `require()` 负向边界、TS wrapper、computed member、
  Vue slot scope 和 SFC line/column 映射已补充专项回归。
- Dev 渐进访问、Build 静态/动态入口、文件移动/删除、Windows 路径、monorepo 非 cwd root 已覆盖。
- Agent 编辑、重复 ID 同步、cache 历史保留、orphan 同进程清理、Git 合并后兼容编辑合并和非空冲突拒绝覆盖已覆盖。
- HTML Build 初始翻译和 `setLang()` 后 text/attribute/comment DOM binding 更新已执行验证。
- `@boses/vite/vue` 与 `/react` adapter 只在对应模式的虚拟模块中加载；Vanilla 入口
  不加载 Vue、React 或 compiler，相关框架依赖保持可选 peer。
- `@boses/mcp` 构建产物保留可执行 shebang/权限，并已由 SDK 客户端通过真实 stdio 子进程
  完成初始化和三个工具的发现；发布 tarball 同时包含 bin、README、MIT License 与类型声明。
- Yuku 平台矩阵首次通过 `workflow_dispatch` 手动运行。workflow 已补充 `main` 分支 push
  触发，并继续保留手动触发和 pull request 触发。

## 仍需外部完成

1. 使用已确认的 npm scope `@boses` 执行 Changesets alpha 流程并发布验证；当前未对外发布。
2. 在仓库 Settings → Pages 将发布源设为 GitHub Actions，并确认 `pages.yml` 成功部署
   用户文档站（`apps/docs`）以及 `/examples/{vanilla,vue,react}`。

以上两项完成前，`PRD 验收标准全部通过` 和 `发布 1.0.0-alpha` 保持未勾选。
