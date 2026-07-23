# Phase 1 验收记录

> 更新日期：2026-07-23

## 已通过

- `pnpm check`：根目录及 12 个 workspace 的 TypeScript、ESLint 检查通过。
- `pnpm test`：20 个测试文件、128 个测试通过。
- `pnpm build`：8 个发布包构建通过。
- `pnpm --filter @ai-i18n/vite benchmark`：Babel/Yuku 冷分析、热替换、200 模块 Build 图完成
  五轮对比。

## 关键回归证据

- React/Vue Hook binding 覆盖 JS、TS、JSX、TSX，支持解构 alias 与 `i18n.t()`；普通
  composable/custom Hook 和 Vue 外部 `<script src>` 已通过真实 Vite Build 回归。
- Vite 与 ESLint 共同消费 `@ai-i18n/analyzer`；成员调用、`undefined` comment、动态参数和
  unresolved 诊断不再各自维护，Vue SFC 也共用 compiler-sfc 分析与 source map。
- Mixed 示例使用自然 `.tsx` 文件名，仅以 Vue 目录 glob 覆盖默认 React fallback，同时完成
  Vue SFC、Vue JSX、React JSX 的 Dev middleware 与生产 Build 验证。
- Vue SFC 使用 compiler-sfc 合并 script/setup 与 inline template，再用 source map 回到 SFC
  原始位置；模板 alias、局部 shadow 和双 script 作用域已覆盖。
- `undefined` comment 按省略处理；未解析静态依赖在保持 pending 的同时输出带位置 warning。
- JS/TS 词法遮蔽、`.mjs/.mts`、CommonJS `require()` 负向边界、TS wrapper、computed member、
  Vue slot scope 和 SFC line/column 映射已补充专项回归。
- Dev 渐进访问、Build 静态/动态入口、文件移动/删除、Windows 路径、monorepo 非 cwd root 已覆盖。
- Agent 编辑、重复 ID 同步、cache 历史保留、orphan 同进程清理、Git 合并后兼容编辑合并和非空冲突拒绝覆盖已覆盖。
- HTML Build 初始翻译和 `setLang()` 后 text/attribute/comment DOM binding 更新已执行验证。
- React/Vue 浏览器入口的发布 manifest 和 JS 不依赖 Vite、compiler 或 Yuku；相关能力仅由可选
  `/vite` peer 提供。
- `@ai-i18n/mcp` 构建产物保留可执行 shebang/权限，并已由 SDK 客户端通过真实 stdio 子进程
  完成初始化和三个工具的发现；发布 tarball 同时包含 bin、README、MIT License 与类型声明。

## 仍需外部完成

1. 在真实 Git 仓库运行 `.github/workflows/yuku-platform.yml`，取得 macOS、Linux、Windows
   x64/arm64 六个平台全部通过的 CI 记录。当前尚未取得该 GitHub Actions 矩阵的实跑记录，
   本机只能证明 darwin-arm64。
2. 确认 npm scope 权限和真实接入项目后，执行 Changesets alpha 流程并发布验证；当前未对外发布。
3. 在仓库 Settings → Pages 将发布源设为 GitHub Actions，并确认 `pages.yml` 成功部署示例导航页。

以上三项完成前，`PRD 验收标准全部通过`、`Yuku 平台验证` 和 `发布 1.0.0-alpha` 保持未勾选。
