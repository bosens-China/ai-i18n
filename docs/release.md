# 发布与 CI

## 工作流职责

各工作流独立维护，职责如下：

| 工作流                   | 触发                                            | 职责                                                                                    |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `ci.yml`                 | PR、普通 `main` push                            | 日常质量门禁、候选 tarball 验证，以及独立站点改动的部署调度                             |
| `release.yml`            | `packages/**` 等路径的 `main` push；可手动      | macOS 原生文件锁门禁、Release Please 版本 / GitHub Release，以及 npm Trusted Publishing |
| `pages.yml`              | CI 确认独立站点改动，或 Release 成功发布 npm 后 | 构建并部署调用方同一提交的 GitHub Pages                                                 |
| `plugin-marketplace.yml` | 插件与两份 Skill 相关路径的 `main` push；可手动 | 发布仅供 Codex 安装的市场分支                                                           |

日常验证只需 `ci.yml`。Release Please 生成的 `chore: release main` 合并提交由
`release.yml` 对同一 SHA 执行完整门禁，因此跳过重复的日常 CI。其他 `main` push 仍执行 CI。
发版与站点部署保留各自的权限与工作流文件；CI 与 Release 通过
[复用工作流](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)统一调度。

## 版本策略

七个 npm 包（Analyzer、Core、ESLint、MCP、OpenAI、SQLite、Vite）首次正式版统一以
`1.0.0` 为目标，之后独立按 SemVer 升版；一次 Release PR 汇总本批需要发布的包。
不使用 `linked-versions`，也不要求无改动、无依赖影响的包陪同发布。

- 自身修复或功能按 `fix` / `feat` 生成版本；不兼容变更必须使用 `!` 或 `BREAKING CHANGE`
  明确表达，并说明迁移影响。
- `node-workspace` 维护内部依赖联动；底层版本变化时，为受影响消费包生成依赖更新与版本。
  消费包的公开 API 若也不兼容，必须单独标记 breaking change，不能用自动依赖更新的 patch
  代替其 major 升版。独立发布的包可能版本不同，不能以版本号相同代替兼容性验证。
- 保留 `workspace:*`，打包后为精确内部依赖；用户只管理直接依赖，不手工对齐整套版本。
- 稳定版发布到 `latest`，显式预发布才使用 `alpha` 等标签。旧 alpha 记录保留，首次正式版
  发布后由新稳定版本更新 `latest`。

## 首次 1.0.0 准备

1. 合并最新 `main` 与本地功能提交，保留已发布版本的 package.json、manifest 和 Changelog。
2. 发布配置使用 `versioning: default`、`prerelease: false`，各包不再设置 `prerelease-type`。
   不提前手改七包版本或把 `.release-please-manifest.json` 当成目标版本文件。
3. 提交准备改动后，再单独创建一个不含文件改动的提交：

   ```sh
   git commit --allow-empty -m "feat: 发布首个正式版本" -m "Release-As: 1.0.0"
   ```

   空提交会进入所有配置包的提交范围，`Release-As` 指定本次目标版本；不要把 footer 放在
   仅修改根配置的普通提交里，也不要在配置中留下长期固定的 `release-as`。

4. 将准备提交和空提交一起推送到 `main`，由配置路径变化触发 Release workflow。
   若准备提交已推送、随后才推送空提交，路径过滤可能不会启动工作流；此时手动运行
   `Release`，选择 `main`，`publish_paths` 留空。
5. 验收 Release PR：七个包均为 `1.0.0`，manifest 与 package.json 一致，内部依赖打包为精确
   版本，Changelog 正确，检查和候选 tarball 安装验证通过后再合并。
6. 合并后按下文正常发布。检查七包 npm 版本、`latest` 和插件市场，而不是只看 GitHub tag。
   本次固定版本 footer 属于历史提交；后续无需重复，按各包 Conventional Commits 升版。

用户安装说明在 npm 上架前必须保留发布状态检查。正式版示例使用 `@^1.0.0`，未发布时会明确
失败，不能删掉选择器后误装历史 `latest`。主动提前试用才选 `@alpha`；用户行为见
[版本选择与升级](../apps/docs/docs/guide/getting-started/versions.md)。
上述一次性升版方式见 [Release Please 官方说明](https://github.com/googleapis/release-please#how-do-i-change-the-version-number)。

## 发版流程

1. 影响 `packages/**` 或发布相关配置的提交合并到 `main` 后，`release.yml` 运行。纯文档、
   Agent Skill 和示例站点提交本身不会触发该 workflow。后续相关路径 push 触发工作流时，
   Release Please 只处理组件范围内符合发布规则的提交；不要假设先前的纯文档提交会自动进入
   某个包的 Release PR。
2. 两个只读门禁并行运行：macOS runner 执行 Core Translation Memory 的原生文件锁并发测试；
   Linux runner 执行 `pnpm check` / `pnpm test`。Turbo 依据 workspace 依赖图安排发布包构建与
   检查；它不负责版本号和发布决策。
3. Linux 门禁随后只选择 npm 上尚不存在的当前版本：普通功能提交尚未经过 Release Please
   版本提升时不会误报；Release PR 与其合并提交则会打包全部候选版本，在空 pnpm workspace
   中用本批 tarball 覆盖候选依赖，其余内部依赖从真实 npm registry 解析，并实际导入公开入口。
   验证后的 tarball、包路径和依赖优先顺序上传为保留一天的 workflow artifact。
4. Release Please 同时等待两个门禁；全部通过后才创建或更新 Release PR、tag 和 GitHub
   Release，禁止先打 tag 再测。没有待发布版本时 Linux 门禁不上传空 artifact。
5. 仅当本次确实创建 Release（或手动补发）时，最终发布 job 才下载已验证 artifact，并按
   Release Please 返回的 `paths_released` 选择包。它不重新构建或打包，不 checkout 仓库、
   不安装项目依赖，也不使用 `NODE_AUTH_TOKEN`，只由 npm CLI 按依赖拓扑通过 OIDC Trusted
   Publishing 上传。
6. 发版通道只有在 Release Please 创建了新 Release，且对应 npm 发布 job 成功后，才调用
   `pages.yml` 部署同一提交的站点。该通道在仅创建或更新 Release PR、npm 失败或跳过时不部署；
   不涉及可发布包改动的站点更新走下面的独立通道。

## 独立站点部署

npm 是否发版继续由 Release Please 根据组件范围与 Conventional Commits 判断。Pages 根据实际
文件改动判断，不用 `docs` / `chore` 等前缀猜测是否需要更新站点。

| 本次 push 的改动                                    | npm            | Pages                             |
| --------------------------------------------------- | -------------- | --------------------------------- |
| 公开文档、静态示例或站点资源                        | 不强制发版     | main 的 CI 通过后部署             |
| 上述站点改动，同时修改包 README 或测试              | 不强制发版     | main 的 CI 通过后部署             |
| 包实现或配置，可同时包含站点改动                    | 按正常发版流程 | 等 Release PR 合并且 npm 成功发布 |
| 仅内部文档、根 README、测试、Skill 或本地 Hono 示例 | 不强制发版     | 不部署                            |
| PR 分支、CI 失败或无法取得比较基线                  | 按既有门禁判断 | 不独立部署                        |

- 独立通道包括 `apps/docs/docs/`、`apps/docs/components/`、文档站配置和依赖清单、
  `examples/react/`、`examples/vue/`、`examples/vanilla/`、`examples/shared/` 的站点输入，
  以及 Pages 构建工作流。示例的 README 和测试不作为站点内容。
- 比较 `github.event.before` 到当前 SHA 的整次 push 差异；不用最后一条提交消息或固定的
  `HEAD~1`。删除也算改动；重命名按旧路径删除和新路径新增判断，避免漏掉包代码变化。
- `packages/` 中除 Markdown 与 `test/` 目录外的改动阻止独立部署。包行为发生变化时仍需
  使用 `fix` / `feat` 等正确发版前缀，不能靠 `docs` 前缀绕过既有版本约定。
- Pages 仍只接受复用调用；CI 和 Release 分别负责各自的条件与权限，不恢复无门禁的独立部署。

## Codex 插件市场

- `pnpm plugins:build` 生成 `dist/codex-marketplace/`，包含市场清单、Codex 插件、两份 Skill、
  MCP 配置与 Stop Hook。只支持 Codex，不生成其他宿主插件。
- `plugin-marketplace.yml` 验证插件测试并构建；`release.yml` 在 npm 发布成功后也构建并发布市场。
  两个入口共享 `plugin-marketplace` 并发组，避免同时写分支。手动市场发布仅允许 `main`。
- 发布脚本先核实插件指定的 MCP 版本已在 npm 发布。检查失败时保留现有市场分支，
  不发布无法安装的快照。完成 npm 发布后，可从 `main` 手动重跑市场工作流。
- CI 使用 `GITHUB_TOKEN` 将生成物 force-push 到 `plugin-marketplace`；该分支只存快照，
  不直接编辑。插件和 Skill 源码统一维护在 `main`，生成物不提交到该分支。
- 用户从该分支添加市场并安装插件；使用方式见 [插件 README](../plugins/ai-i18n/README.md)。

## Release PR 的 CI 审批

Release Please 当前使用仓库内置的 `GITHUB_TOKEN` 创建和更新版本 PR。GitHub 会让这类 PR 的
`pull_request` workflow 先等待具有写权限的维护者批准；这是 bot PR 的独立安全门禁，不由外部贡献者
审批策略决定。

维护者按以下顺序处理版本 PR：

1. 在 PR 的合并状态面板中选择 **Approve workflows to run**。
2. 等待普通 CI 完成，确认 `pnpm check`、`pnpm test` 和候选 tarball 验证通过。
3. 审查版本号、Changelog 与 workspace 依赖联动后再合并。
4. 合并后的 `main` 提交继续由 `release.yml` 验证并创建 tag、GitHub Release 与 npm 发布。

不要在 workflow 获批前合并版本 PR，否则尚未执行 job 的 run 会以过期失败结束。当前不为此流程新增
PAT 或 GitHub App，也不向版本提交添加 `[skip ci]`；若将来需要版本 PR 无人工介入地自动运行 CI，再
单独评估最小权限 GitHub App。

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
  "packages/sqlite",
  "packages/vite"
]
```

会跳过 Release Please，在验证通过后按当前 `package.json` 版本直接 publish。工作流会拒绝
非 `main` 分支、空数组、重复路径以及未在 `release-please-config.json` 中登记的包路径；
不需要新增 Secret 或 GitHub Environment。

手动 npm 补发不会触发 Pages。若站点部署失败，在对应的 CI 或 Release 运行中选择
**Re-run failed jobs**，只重跑失败的站点任务，保留已经成功的 npm 发布结果。

## 约定

- 七个 npm 包的 Trusted Publisher workflow 文件名保持为 `release.yml`。
- 发布校验脚本使用根 workspace 锁定的 `tsx` 执行，并纳入根 `tsc` 检查。CI 必须先完成
  `pnpm install --frozen-lockfile`，再通过 `pnpm exec tsx` 调用，不使用临时下载的 runner。
- 发布包之间统一使用 `workspace:*`，`pnpm pack` 后必须是当前 workspace 版本的
  精确依赖。旧的 ESLint、Vite 等消费包不能自动漂移到新 Analyzer/Core；底层版本变化由
  Release Please 的 `node-workspace` 插件生成配套消费包版本。
- 发布包的公共入口、运行行为或内部版本契约变化必须使用会触发发布的 `fix` / `feat`
  Conventional Commit；`refactor` 只允许不改变已发布契约的内部整理。前缀需符合
  `googleapis/release-please-action`，否则版本号不对或不会开 Release PR。
- 正式稳定版若恢复 `workspace:^`，必须先建立 SemVer 向后兼容和依赖范围最低版本测试；
  不能只验证范围内的最新版本。
