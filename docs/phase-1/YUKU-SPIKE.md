# Yuku 准入 Spike

> 日期：2026-07-22（平台矩阵结论按 2026-07-23 ACCEPTANCE 回写；Babel 对照代码已于验收后移除）
>
> 本文是历史 Spike 记录，不是当前实现规范；现行持久化、诊断与 MCP 契约见
> [Phase 7](../phase-7/PRD.md)、[Phase 8](../phase-8/PRD.md) 与
> [`docs/mcp/PRD.md`](../mcp/PRD.md)。
>
> 候选版本：`yuku-analyzer@0.7.3`（精确锁定）
>
> 结论：采用 Yuku。正确性与性能均已对照 Babel 完成验证，Yuku 可完整替代 Babel 作为默认分析器；仓库内不再保留 Babel 对照实现或 benchmark 脚本。

## 边界

内部适配层只暴露两个核心操作（签名以 `@ai-i18n/analyzer` 为准）：

```ts
analyzeModule(code, id, analyzer?, lang?)
extractMessages(module, runtimeModuleId?, translationHooks?, autoImportRuntime?)
```

- `analyzeModule` 使用单文件 `analyze`，传入 `Analyzer` 时复用其 add/replace 状态；
  可选 `lang` 指定解析语言。
- `extractMessages` 识别最终解析到 `virtual:ai-i18n` 的 `t` import symbol，并在同一 AST
  中按框架提供的声明式 Hook 规则识别解构后的 `t`；`autoImportRuntime` 用于按需导入场景。
- parser/analyzer 选择不进入公共配置。
- Vite、文件写入、Provider 和 Runtime 注册不进入该适配层。

## 正确性结果

准入阶段曾由 `packages/vite/test/yuku-spike.test.ts` 与旧 Babel extractor 对照，目标语义结果一致。Yuku 成为唯一分析实现后，仍有产品价值的解析与绑定回归已并入
`packages/analyzer/test/analyzer.test.ts`，跨文件行为由 ESLint 与真实 Vite Build 测试保护，历史
Spike 测试文件已移除。当前主要覆盖：

- 字符串、静态 options、局部 const、条件分支与 template literal。
- JS、TS、JSX、TSX。
- decorators 和 dynamic import。
- import alias，拒绝其他来源的同名 `t`。
- re-export 后继续解析到约定虚拟模块。
- 跨文件静态 const definition。
- 动态参数只产生 warning，不猜测结果。
- 词法遮蔽、`undefined` comment、未解析 import 的 pending warning。

Analyzer 增量状态不再直接测试 Yuku 依赖自身的 add/remove，而由 `ProjectState` 与真实 Vite
Build Watch 回归保护实际产品调用路径。

旧实现支持的全局 `t`、`useI18nText` tagged template 和任意普通字符串不属于新协议，因此不纳入结果一致性要求。

## 基准

准入阶段曾用内部 benchmark 对比 Babel 与 Yuku 的分析边界（不含 bundler、磁盘和 Provider 耗时）。脚本已在验收后移除，下表保留当时五轮中位数作为选型证据。

环境：Apple M1 Pro、darwin-arm64、Node 26.5.0。单文件每轮执行 200 次；Build 使用
200 个 TypeScript 模块、每轮完整 add/link/walk 10 次：

| 操作                              |  中位耗时 |
| --------------------------------- | --------: |
| Babel cold parse + traverse       |  31.77 ms |
| Yuku cold analyze + semantic walk |   6.89 ms |
| Yuku warm replace + semantic walk |   8.29 ms |
| Babel Build 完整分析图            | 182.81 ms |
| Yuku Build 完整分析图             |  52.16 ms |

相对 Babel，Yuku 冷分析约快 4.6×，完整 Build 图约快 3.5×。该数据用于 parser 准入，不替代真实项目的端到端性能数据。

## 平台状态

六平台矩阵曾在准入 CI 通过（详见 [ACCEPTANCE.md](./ACCEPTANCE.md)）：

- Linux、Windows、macOS 的 x64 / arm64，共 6 个 job。
- 每个 job 执行真实安装、native binding 加载与 Yuku 准入测试。

准入完成后专项 workflow 已移除；当前 Analyzer 回归随常规 CI 执行。

## 决策

Yuku 在当前目标语义上通过正确性、semantic binding、跨文件链接、增量替换与六平台 CI 验证，
并明显快于 Babel 基线，可完整替代 Babel 完成静态提取分析。`@ai-i18n/vite` 与
`@ai-i18n/analyzer` 仅以 Yuku 为分析实现，不再保留 Babel 回退或对照路径。
