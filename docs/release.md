# 发布与 CI

## 工作流职责

三个 workflow 分工不同，不要合并成一个：

| 工作流        | 触发                                       | 职责                                                              |
| ------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `ci.yml`      | PR、`main` push                            | 日常质量门禁：`pnpm check` + `pnpm test`                          |
| `release.yml` | `packages/**` 等路径的 `main` push；可手动 | Release Please 版本 / GitHub Release，以及 npm Trusted Publishing |
| `pages.yml`   | 文档与示例相关路径的 `main` push；可手动   | 构建并部署 GitHub Pages                                           |

日常验证只需 `ci.yml`。发版与站点部署有独立权限与副作用，必须单独保留。

## 发版流程

1. 影响 `packages/**` 或发布相关配置的提交合并到 `main` 后，`release.yml` 运行。纯文档、Agent skills、示例站点等路径不会触发；被跳过的 Conventional Commit 会在下次相关 push 时一并纳入。
2. **先**执行 `pnpm check` / `pnpm test`，通过后再跑 Release Please。禁止先打 tag 再测，以免测挂后留下未发布的 GitHub Release。
3. 仅当本次确实创建 Release（或手动补发）时，才 `pnpm pack` 展开 `workspace:` 依赖，再由 npm CLI 使用 OIDC Trusted Publishing 上传。不使用 `NODE_AUTH_TOKEN`。
4. 合并 Release PR 会改 `packages/**`，因此也可能触发 Pages；这是路径过滤的预期副作用。

## 手动补发

若 GitHub Release / tag 已创建但 npm 未上传（历史事故或发布步骤中断），在 Actions 里对 `Release` 使用 `workflow_dispatch`，填写 `publish_paths`，例如：

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

会跳过 Release Please，在验证通过后按当前 `package.json` 版本直接 publish。

## 约定

- 六个 npm 包的 Trusted Publisher workflow 文件名保持为 `release.yml`。
- Conventional Commit 前缀需符合 `googleapis/release-please-action` 要求，否则版本号不对或不会开 Release PR。
