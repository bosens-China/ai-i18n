# npm 发布流程

仓库使用 Release Please 根据 Conventional Commit 维护版本和 CHANGELOG。日常开发不再执行 Changesets 或手工修改包版本。

## 自动流程

1. 功能提交合并到 `main` 后，`.github/workflows/release.yml` 运行 Release Please。
2. Release Please 根据 `fix:`、`feat:` 和带 `!` 的破坏性变更创建或更新 Release PR。
3. 合并 Release PR 后，Release Please 创建各包的 Git tag 与 GitHub Release。
4. 仅当本次确实创建 Release 时，CI 执行 `pnpm check`、`pnpm test` 并发布对应 npm 包。
5. 发布先通过 `pnpm pack` 展开 `workspace:` 依赖，再由 npm CLI 使用 OIDC Trusted Publishing 上传。

Release Please PR 默认使用仓库 `GITHUB_TOKEN`。若希望机器人 PR 触发其他 PR 工作流，可配置 `RELEASE_PLEASE_TOKEN` 为 fine-grained PAT；未配置时自动回退到 `GITHUB_TOKEN`。

## 提交约定

| 提交类型                                  | SemVer 含义 |
| ----------------------------------------- | ----------- |
| `fix(scope): ...`                         | patch       |
| `feat(scope): ...`                        | minor       |
| `feat(scope)!: ...` 或 `BREAKING CHANGE:` | major       |

需要强制指定版本时，在提交正文添加 `Release-As: x.y.z`。文档、测试和仓库维护提交应继续使用 `docs:`、`test:`、`chore:` 等准确类型。

## Alpha 阶段

`.release-please-manifest.json` 以已经发布的 `1.0.0-alpha.0` 为起点，`release-please-config.json` 使用 `prerelease` versioning strategy 和 `alpha` 类型。npm dist-tag 根据包版本自动选择：预发布版本使用 `alpha`，正式版本使用 `latest`。

首次 Release PR 合并后，`bootstrap-sha` 已完成历史边界初始化，可以从配置中删除。

准备发布正式版时：

1. 在独立 PR 中将 `prerelease` 改为 `false`。
2. 检查 Release PR 中每个包的目标版本和 CHANGELOG。
3. 合并 Release PR 后，CI 会自动使用 `latest` dist-tag 发布正式版本。

## 外部配置

- GitHub 仓库必须允许 GitHub Actions 创建 Pull Request。
- 六个 npm 包的 Trusted Publisher workflow 文件名保持为 `release.yml`。
- GitHub Actions 使用 GitHub-hosted runner，并保留 `id-token: write` 权限。
