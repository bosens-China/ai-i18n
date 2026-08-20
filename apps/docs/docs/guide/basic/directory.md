---
title: 生成文件与 Git
description: 了解 ai-i18n 生成的文件、提交规则，以及何时运行完整 Build
---

ai-i18n 默认在 Vite root 下创建 `i18n/` 目录，用来保存译文和本地构建产物：

```text
i18n/
├── translations/          # 默认 JSON 存储
│   ├── manifest.json
│   └── 00.json ... ff.json
├── overrides.json
├── extracted/
├── locales/
└── storage.json           # 仅 SQLite 存储
```

你通常只需要关注两类文件：

- `translations/`：默认的分片 JSON Translation Memory，保存自动翻译或 Agent 补齐的译文。
- `storage.json`：仅在选择 SQLite 时生成。缺少该文件表示使用默认 JSON；文件不包含本机数据库路径。
- `overrides.json`：人工确认过的最终译文。它优先于自动翻译结果。

`extracted/` 和 `locales/` 都是构建产物。插件会根据源码和上述译文重新生成它们，不要直接编辑。

## Git 提交规则

将以下文件与源码一起提交：

- `src/ai-i18n.d.ts`，或通过 `dts` 配置的声明文件；
- Vue 自动导入模式生成的相邻 `.vue.d.ts` 声明文件；
- `i18n/translations/**/*.json`（使用默认 JSON 存储时）；
- `i18n/storage.json`（使用 SQLite 存储时）；
- `i18n/overrides.json`。

将以下目录加入 `.gitignore`：

```text
i18n/extracted/
i18n/locales/
logs/
*.log
```

`logs/` 与 `*.log` 是 OpenAI Provider 的本地审查日志，可能包含完整提示词、业务文案和模型输出，
不得提交。使用自定义日志目录时也要忽略该目录。详情见
[LLM 日志与排障](/guide/advanced/llm-logs)。

默认的分片 JSON 适合团队协作。它可以随源码提交，也便于在 PR 中审查译文变化。团队成员与 CI 拉取
同一份仓库后，可以直接复用已经提交的自动译文和人工译文。

:::important
译文文件与引用它们的源码应在同一个 PR 中提交。这样其他开发者和 CI 才能得到一致的翻译结果。
:::

安装 `@ai-i18n/sqlite` 并配置 `translationMemory.storage: sqlite()` 时，全局数据库位于用户目录，不提交 Git；项目仍提交
`storage.json` 与 `overrides.json`。SQLite 是本机缓存，新机器和 CI 需要 Provider 重新生成自动
译文。因此，需要跨机器共享自动译文的团队应使用默认的分片 JSON。两种存储的选择见
[Translation Memory](/guide/advanced/translation-memory)。

声明文件的作用和自定义路径见
[TypeScript 与生成声明](/guide/quality/typescript)。

## 什么时候运行完整 Build

开发服务器只处理浏览器实际访问过的模块。以下情况请运行一次完整 `vite build`：

1. 首次接入 ai-i18n；
2. 准备用 Agent + MCP 批量补译、审计完整消息集或提交译文；
3. 切换分支后，或修改了源码、Vite 配置和提取相关配置；
4. `i18n/extracted/` 缺失、为空，或不确定它是否仍与当前源码一致。

完整 Build 会处理从应用入口可达的模块。未被应用引用的文件不会进入翻译结果。

Vite Dev 的翻译校对页面只显示浏览器已经访问过的模块，适合边浏览业务页面边人工确认译文；它不替代
提交前的完整 Build，也不能作为删除孤立译文的完整性依据。

## Monorepo 中的目录归属

一个 Vite build 必须独占一个 i18n 目录。例如：

```text
apps/
├── web/
│   └── i18n/
└── admin/
    └── i18n/
packages/
└── ui/
    └── src/
```

`web` 引用 `packages/ui` 的本地 ESM 源码时，完整 Build 会把 UI 文案纳入
`apps/web/i18n`。共享源码包不需要重复注册 ai-i18n，也不需要单独创建 i18n 目录，除非它
自己拥有独立的 Vite build。

不要让 Web、Admin 或包构建共用一个目录。完整 Build 会按当前应用的模块图重建
`extracted/` 和 `locales/`，不同构建会相互覆盖。补译或校对时也应分别选择每个应用。

## 缺译时会发生什么

目标语言缺少译文时，页面会显示源码文案。你可以配置 [AI 翻译](/guide/advanced/ai-translation)，也可以按
[补齐和确认译文](/guide/basic/translations)手动处理。

同一句原文在不同语境下需要不同译法时，为 `t()` 提供 `comment`：

```ts
t('提交', { comment: '创建 Git 提交' });
t('提交', { comment: '表单按钮' });
```

## 处理合并冲突

合并冲突时保留 `translations/` 与 `overrides.json` 的有效内容，不要手工调整消息所属分片。同一人工
译文出现不同版本时，由负责人确认最终措辞。解决冲突后运行一次 Build，再检查页面效果。

如果同时使用 Agent 或 Provider 写入译文，避免在编辑器中并行手改同一份译文文件。先完成一方操作，再进行
另一方操作。
