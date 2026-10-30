# Hono 远程译文示例

使用本地 Hono 服务演示 key 提交、全局语言 JSON、公开版本 meta、缺译门禁与懒加载。固定译文模拟服务端成果，无需外部模型凭据。

## 本地运行

在仓库根目录执行：

```sh
pnpm build
pnpm --filter @ai-i18n/example-remote dev
```

浏览器访问 `http://127.0.0.1:51884`，Hono 仅监听本机 `127.0.0.1:51885`。

1. 检查页面版本、服务端版本、实际提交的 key 和请求次数。
2. 发布下一版译文：服务端版本变化，当前页面仍使用旧快照。
3. 点击“重启 Dev 并获取”：只重启 Vite，Hono 状态保留；新页面使用新版本。
4. 模拟缺译后重启：英文模式中的“保存成功”回退原文。
5. 模拟无效译文后重启：终端报告占位符不匹配，拒绝应用该快照。恢复完整译文并重启后继续。

“重启 Dev 并获取”属于这个演示的控制功能，不是插件提供的浏览器在线更新 API。
后端使用固定示例译文模拟翻译完成，无需模型凭据；重启整个演示进程会重置内存状态。

## 静态构建与缺译检查

```sh
pnpm --filter @ai-i18n/example-remote build
pnpm --filter @ai-i18n/example-remote preview
```

构建脚本临时启动 Hono、提交文案并获取快照，然后关闭后端。preview 只服务静态 dist，语言切换和懒加载仍可使用。

在 macOS/Linux 中可额外验证缺译和无效结果会阻止出包：

```sh
AI_I18N_DEMO_SCENARIO=pending pnpm --filter @ai-i18n/example-remote build
AI_I18N_DEMO_SCENARIO=invalid pnpm --filter @ai-i18n/example-remote build
```

完整接入说明见[远程文案与译文](../../apps/docs/docs/guide/advanced/remote-translations.md)。

## 部分远程覆盖与本地补齐

停止上面的 Dev 后运行：

```sh
pnpm --filter @ai-i18n/example-remote dev:overlay
```

这个入口使用 `mode: 'overlay'` 和独立的 `i18n-overlay/` 本地示例数据，初始场景为 partial。
服务器只返回“保存成功”的高优先级译文，其余 UI、Submit/Commit 和懒加载文案来自本地。

1. 页面显示 `overlay`、`Priority server copy` 和已应用版本；服务器译文盖过本地人工校对。
2. 点击“撤销全部远程覆盖”，再“重启 Dev 并获取”：显示 `Reviewed local save`，其他英文仍保留。
3. 点击“启用部分远程覆盖”并重启：重新显示服务器文案。
4. 查看 `i18n-overlay/translations/` 和 `overrides/`，本地文案保持独立，未被远程值覆盖。

对应静态构建：

```sh
pnpm --filter @ai-i18n/example-remote build:overlay
pnpm --filter @ai-i18n/example-remote preview
```

overlay 的 pending 场景可由本地译文补齐，不会仅因服务器缺译而阻止构建；invalid 快照仍会失败。
