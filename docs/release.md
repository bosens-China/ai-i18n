# 发布与 CI

## 工作流职责

三个 workflow 分工不同，不要合并成一个：

| 工作流        | 触发                                       | 职责                                                                                    |
| ------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `ci.yml`      | PR、`main` push                            | 日常质量门禁，以及 npm 尚未发布版本的候选 tarball 外部安装验证                          |
| `release.yml` | `packages/**` 等路径的 `main` push；可手动 | macOS 原生文件锁门禁、Release Please 版本 / GitHub Release，以及 npm Trusted Publishing |
| `pages.yml`   | 文档与示例相关路径的 `main` push；可手动   | 构建并部署 GitHub Pages                                                                 |

日常验证只需 `ci.yml`。发版与站点部署有独立权限与副作用，必须单独保留。

## 发版流程

1. 影响 `packages/**` 或发布相关配置的提交合并到 `main` 后，`release.yml` 运行。纯文档、
   Agent skills 和示例站点提交本身不会触发该 workflow。后续相关路径 push 触发工作流时，
   Release Please 只处理组件范围内符合发布规则的提交；不要假设先前的纯文档提交会自动进入
   某个包的 Release PR。
2. **先**在只读的 macOS runner 执行 Core Translation Memory 的原生文件锁并发测试，再在
   只读的 Linux runner 执行 `pnpm check` / `pnpm test`。Turbo 依据 workspace 依赖图安排
   发布包构建与检查；它不负责版本号和发布决策。
3. Linux 验证随后运行 `pnpm release:verify`。脚本只选择 npm 上尚不存在的当前版本：普通
   功能提交尚未经过 Release Please 版本提升时不会误报；Release PR 与其合并提交则会打包
   全部候选版本，在空 pnpm workspace 中用本批 tarball 覆盖候选依赖，其余内部依赖从真实
   npm registry 解析，并实际导入公开入口。全部通过后才运行 Release Please，禁止先打 tag
   再测。
4. 仅当本次确实创建 Release（或手动补发）时，只读的打包 job 才会重新构建并通过
   `pnpm pack` 展开 `workspace:` 依赖。它再次校验最终 tarball 的内部精确版本、exports
   目标、外部安装与入口导入，并按 tarball manifest 生成依赖优先的发布顺序。
5. 最终发布 job 只下载 tarball 和顺序清单，由 npm CLI 按 Core、Analyzer、消费包的依赖
   拓扑使用 OIDC Trusted Publishing 上传；它不 checkout 仓库、不安装项目依赖，也不使用
   `NODE_AUTH_TOKEN`。
6. 合并 Release PR 会改 `packages/**`，因此也可能触发 Pages；这是路径过滤的预期副作用。

## 手动补发

若 GitHub Release / tag 已创建但 npm 未上传（历史事故或发布步骤中断），在 Actions 里对
`Release` 使用 `workflow_dispatch`，选择 `main` 并填写 `publish_paths`，例如：

```json
[
  "packages/analyzer",
  "packages/core",
  "packages/eslint",
  "packages/mcp",
  "packages/openai",
  "packages/vite"
]
```

会跳过 Release Please，在验证通过后按当前 `package.json` 版本直接 publish。工作流会拒绝
非 `main` 分支、空数组、重复路径以及未在 `release-please-config.json` 中登记的包路径；
不需要新增 Secret 或 GitHub Environment。

## 约定

- 六个 npm 包的 Trusted Publisher workflow 文件名保持为 `release.yml`。
- Alpha 阶段发布包之间统一使用 `workspace:*`，`pnpm pack` 后必须是当前 workspace 版本的
  精确依赖。旧的 ESLint、Vite 等消费包不能自动漂移到新 Analyzer/Core；底层版本变化由
  Release Please 的 `node-workspace` 插件生成配套消费包版本。
- 发布包的公共入口、运行行为或内部版本契约变化必须使用会触发发布的 `fix` / `feat`
  Conventional Commit；`refactor` 只允许不改变已发布契约的内部整理。前缀需符合
  `googleapis/release-please-action`，否则版本号不对或不会开 Release PR。
- 正式稳定版若恢复 `workspace:^`，必须先建立 SemVer 向后兼容和依赖范围最低版本测试；
  不能只验证范围内的最新版本。
- 首个非 prerelease 稳定版本发布前，必须完成
  [单文件 Translation Memory 兼容清理计划](./plans/remove-legacy-translation-memory/PRD.md)，并确认仓库中不存在
  `TODO(stable-release)`。
