# Release Please PR CI 审批问题讨论报告

> 状态：讨论中。本文记录事实与备选方案，不构成现行发布决策。

## 问题摘要

Release Please 自动创建版本 PR 时，普通 CI 也会因 `pull_request` 触发。该 PR 的作者是
`github-actions[bot]`，GitHub 将其按外部贡献者审批规则处理；工作流尚未获批时，版本 PR 已被合并，
于是 CI 显示“需要批准但过期”的失败状态。

这不是代码检查、构建或发布失败。它是一次没有实际执行 job 的重复 CI run。

## 已核对的事实

| 事项     | 证据                                                                        | 结论                                                                                           |
| -------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 失败 run | [CI #101](https://github.com/bosens-China/ai-i18n/actions/runs/33154229023) | `pull_request` 触发，持续约 25 秒，未启动任何 job。                                            |
| 对应 PR  | [PR #30](https://github.com/bosens-China/ai-i18n/pull/30)                   | 来源分支为 `release-please--branches--main`，作者为 `github-actions[bot]`，已经合并。          |
| 自动提交 | 远端提交 `ed49418`                                                          | 提交信息为 `chore: release main`。                                                             |
| 普通 CI  | [`ci.yml`](../.github/workflows/ci.yml)                                     | 对所有 `pull_request` 触发；只在 Release Please 合并提交推到 `main` 时跳过日常 job。           |
| 发布门禁 | [`release.yml`](../.github/workflows/release.yml)                           | 在创建/处理 Release Please 结果之前运行原生锁、`pnpm check`、`pnpm test` 与候选 tarball 验证。 |
| 分支保护 | GitHub Branch Protection API                                                | `main` 当前未设置必需状态检查。                                                                |

## 当前流程

```text
普通 PR（无论作者是谁）
  → 普通 CI
  → 合并 main
  → Release 工作流完整验证
  → Release Please 创建版本 PR
  → 版本 PR 合并
  → Release 工作流验证该合并提交并创建 tag / GitHub Release / npm 发布
```

因此，需要区分两类 PR：

| PR 类型                       | 是否应运行普通 CI | 原因                                           |
| ----------------------------- | ----------------- | ---------------------------------------------- |
| 人工业务 PR（包括外部贡献者） | 是                | 在合并前验证业务改动。                         |
| Release Please 自动版本 PR    | 否，属于重复验证  | 发布工作流已负责版本候选与发布提交的完整验证。 |

## 为什么当前会出现红标

`ci.yml` 的顶层 `pull_request` 会在 Release Please PR 打开时创建 CI run。GitHub 的审批门禁发生在
job 条件判断之前，因此即使将 job 写成“Release Please 分支跳过”，也可能仍然产生一条等待审批的 run。

GitHub 审批规则会检查 PR 作者和触发事件的 actor；当前 bot 被识别为 `CONTRIBUTOR`，所以命中审批门禁。
PR 在审批前被合并，run 便以过期失败结束。

## 已排除的方案

### 给版本提交加 `[skip ci]`

不可直接采用。GitHub 会对包含该标记的提交跳过全部 `push` 与 `pull_request` workflow，既会跳过普通
CI，也会跳过版本 PR 合并到 `main` 后的 `Release` workflow。结果是不会创建 tag、GitHub Release 或 npm
发布。

GitHub 同时说明，被跳过的必需检查会保持 Pending；如果将来为版本 PR 设置了必需 CI，该 PR 还会被阻塞。

## 可讨论方案

### 方案 A：保留 run，调整审批策略

将 Actions 审批策略由“全部外部贡献者均需批准”改为“仅首次贡献者需批准”。Release Please PR 会正常跑出
绿色 CI；外部贡献者的首次 PR 仍需批准。

- 优点：改动最小，不触碰发布架构。
- 缺点：Release Please PR 的普通 CI 仍然是重复工作；会放宽一次全局审批策略。

### 方案 B：让 Release Please 使用受信任身份创建 PR

使用仓库维护者或组织 GitHub App 的最小权限 token 作为 `RELEASE_PLEASE_TOKEN`，使自动版本 PR 不再被当作
外部贡献者。普通 CI 仍会运行，但不会等待审批。

- 优点：保留外部 PR 审批策略，发布流程无需重构。
- 缺点：仍会产生重复 CI；需要管理 token 或 GitHub App 权限与轮换。

### 方案 C：重构发布触发边界

将“版本 PR 合并后发布”从同一提交的 `push` 触发改为独立、受信任的发布触发器。届时可让版本 PR 使用
`[skip ci]`，而发布 workflow 不受影响。

- 优点：完全符合“自动版本 PR 不产生普通 CI”的目标。
- 缺点：发布架构、权限模型、失败恢复与审计链路都要重做；应作为独立需求设计和验证，不能只改一行 YAML。

## 建议的讨论结论

如果目标是尽快消除红标，优先方案 A；如果必须保留当前严格的外部 PR 审批策略，选择方案 B。
如果团队坚持“Release Please PR 不得产生普通 CI run”，再单独立项方案 C。

在作出决定前，不应修改普通 PR 的 CI 触发范围，也不应向当前版本提交添加 `[skip ci]`。

## 参考

- [GitHub：管理仓库的 Actions 设置](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)
- [GitHub：跳过 workflow run](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs)
- [Release Please manifest 配置](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md)
