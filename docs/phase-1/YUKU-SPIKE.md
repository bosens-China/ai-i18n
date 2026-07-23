# Yuku 准入 Spike

> 日期：2026-07-22
>
> 候选版本：`yuku-analyzer@0.7.3`（精确锁定）
>
> 结论：采用 Yuku，保留跨平台 CI 准入门槛。

## 边界

内部适配层只暴露两个核心操作：

```ts
analyzeModule(code, id, analyzer?)
extractMessages(module, runtimeModuleId?, translationHooks?)
```

- `analyzeModule` 使用单文件 `analyze`，传入 `Analyzer` 时复用其 add/replace 状态。
- `extractMessages` 识别最终解析到 `virtual:ai-i18n` 的 `t` import symbol，并在同一 AST
  中按框架提供的声明式 Hook 规则识别解构后的 `t`。
- parser/analyzer 选择不进入公共配置。
- Vite、文件写入、Provider 和 Runtime 注册不进入该适配层。

## 正确性结果

`packages/vite/test/yuku-spike.test.ts` 共 14 个场景通过：

- 与旧 Babel extractor 对照：字符串、comment、局部 const、条件分支、静态 template literal。
- JS、TS、JSX、TSX。
- decorators 和 dynamic import。
- import alias，拒绝其他来源的同名 `t`。
- re-export 后继续解析到约定虚拟模块。
- 跨文件静态 const definition。
- 动态参数只产生 warning，不猜测结果。
- Analyzer 同路径 add/replace 和 remove。

旧实现支持的全局 `t`、`useI18nText` tagged template 和任意普通字符串不属于新协议，因此不纳入结果一致性要求。

## 基准

运行命令：

```sh
pnpm --filter @ai-i18n/vite benchmark
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

- macOS arm64：安装、native binding 加载、测试和 benchmark 已通过。
- macOS x64、Linux x64/arm64、Windows x64/arm64：包已提供对应 optional bindings，但尚未在本项目 CI 实际安装验证。
- `.github/workflows/yuku-platform.yml` 已配置六个平台的真实安装、native binding 加载、
  fixture 测试和 benchmark；必须等待各 runner 实际跑绿后才能勾选平台验收。

跨平台矩阵完成前不删除 Babel fixtures，也不把 Yuku 平台兼容标记为最终验收通过。

## 决策

Yuku 在当前目标语义上通过正确性、semantic binding、跨文件链接和增量替换验证，并明显快于现有 Babel 基线。因此 `@ai-i18n/vite` 后续实现以 Yuku 为默认分析器；如果跨平台 CI 出现可复现的安装或正确性失败，再按 PRD 回退 Babel。
