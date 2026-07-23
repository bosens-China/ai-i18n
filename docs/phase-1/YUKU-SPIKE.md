# Yuku 准入 Spike

> 日期：2026-07-22（平台矩阵结论按 2026-07-23 ACCEPTANCE 回写）
>
> 候选版本：`yuku-analyzer@0.7.3`（精确锁定）
>
> 结论：采用 Yuku。六平台 CI 矩阵已通过；Babel 基线仅保留为对照与 benchmark，不是默认回退路径。

## 边界

内部适配层只暴露两个核心操作（签名以 `@boses/analyzer` 为准）：

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

`packages/vite/test/yuku-spike.test.ts` 覆盖多组场景（含 `it.each`），当前全部通过。主要覆盖：

- 与旧 Babel extractor 对照：字符串、comment、局部 const、条件分支、静态 template literal。
- JS、TS、JSX、TSX。
- decorators 和 dynamic import。
- import alias，拒绝其他来源的同名 `t`。
- re-export 后继续解析到约定虚拟模块。
- 跨文件静态 const definition。
- 动态参数只产生 warning，不猜测结果。
- Analyzer 同路径 add/replace 和 remove。
- 词法遮蔽、`undefined` comment、未解析 import 的 pending warning。

旧实现支持的全局 `t`、`useI18nText` tagged template 和任意普通字符串不属于新协议，因此不纳入结果一致性要求。

## 基准

运行命令：

```sh
pnpm --filter @boses/vite benchmark
```

环境：Apple M1 Pro、darwin-arm64、Node 26.5.0。单文件每轮执行 200 次；Build 使用
200 个 TypeScript 模块、每轮完整 add/link/walk 10 次。以下为 5 轮中位数：

| 操作                              |  中位耗时 |
| --------------------------------- | --------: |
| Babel cold parse + traverse       |  31.77 ms |
| Yuku cold analyze + semantic walk |   6.89 ms |
| Yuku warm replace + semantic walk |   8.29 ms |
| Babel Build 完整分析图            | 182.81 ms |
| Yuku Build 完整分析图             |  52.16 ms |

该 benchmark 固定比较 Babel/Yuku 分析边界，不包含 bundler、磁盘和 Provider 耗时；它用于
parser 准入，不替代真实项目的端到端性能数据。

## 平台状态

六平台矩阵已在 CI 通过（详见 [ACCEPTANCE.md](./ACCEPTANCE.md)）：

- Linux、Windows、macOS 的 x64 / arm64，共 6 个 job。
- 工作流：`.github/workflows/yuku-platform.yml`（`main` push、pull request、`workflow_dispatch`）。
- 每个 job 执行真实安装、native binding 加载与 Yuku 准入测试。

Babel fixtures / benchmark 基线保留作对照，不作为默认分析回退路径。若未来出现可复现的
安装或正确性失败，再按 PRD 评估是否回退。

## 决策

Yuku 在当前目标语义上通过正确性、semantic binding、跨文件链接、增量替换与六平台 CI 验证，
并明显快于现有 Babel 基线。`@boses/vite` 以 Yuku 为默认分析器。
