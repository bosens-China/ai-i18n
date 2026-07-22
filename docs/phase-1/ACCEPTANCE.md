# Phase 1 验收记录

> 更新日期：2026-07-22

## 已通过

- `pnpm lint`：通过。
- `pnpm check`：6 个发布包 TypeScript 检查通过。
- `pnpm test`：17 个测试文件、88 个测试通过。
- `pnpm build`：6 个发布包构建通过。
- `pnpm pack:check`：6 个 tarball 的 exports 产物、README、文件白名单和客户端依赖边界通过。
- `pnpm examples:dev`：Vanilla、Vue、React、Mixed 的真实 Vite middleware transform 通过。
- `pnpm examples:build`：四个示例生产构建通过。
- `pnpm benchmark:yuku`：Babel/Yuku 冷分析、热替换、200 模块 Build 图完成五轮对比。

## 关键回归证据

- React/Vue 用声明式 Hook binding 规则复用 ProjectState 中唯一一次 Yuku JS AST；ESLint 同步识别
  两种 `useI18n()` binding；Vue 模板只复用 Vue compiler 表达式 AST 做映射，再进入一次共享 Yuku 分析。
- Dev 渐进访问、Build 静态/动态入口、文件移动/删除、Windows 路径、monorepo 非 cwd root 已覆盖。
- Agent 编辑、重复 ID 同步、cache 历史保留、orphan 同进程清理、Git 合并后兼容编辑合并和非空冲突拒绝覆盖已覆盖。
- HTML Build 初始翻译和 `setLang()` 后 text/attribute/comment DOM binding 更新已执行验证。
- React/Vue 浏览器入口的发布 manifest 和 JS 不依赖 Vite、compiler 或 Yuku；相关能力仅由可选
  `/vite` peer 提供。

## 仍需外部完成

1. 在真实 Git 仓库运行 `.github/workflows/yuku-platform.yml`，取得 macOS、Linux、Windows
   x64/arm64 六个平台全部通过的 CI 记录。当前尚未取得该 GitHub Actions 矩阵的实跑记录，
   本机只能证明 darwin-arm64。
2. 由仓库所有者确认 License 和真实 repository URL，再同步到根目录及六个 package manifest。
3. 确认 npm scope 权限和真实接入项目后，执行 Changesets alpha 流程并发布验证；当前未对外发布。

以上三项完成前，`PRD 验收标准全部通过`、`Yuku 平台验证` 和 `发布 1.0.0-alpha` 保持未勾选。
