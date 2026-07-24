---
title: 文件与工作流
description: i18n 协议目录、Git 提交约定与 Agent 协作流程
---

## 目录协议

默认在 Vite root 下生成：

```text
i18n/
├── cache.json                 # fingerprint、引用与全局 Translation Memory
├── extracted/
│   └── src/example.ts.json    # source / comment / location / 各语言翻译
└── locales/
    ├── zh-CN.json             # 源语言始终输出 source
    └── en-US.json             # 缺失项保留 null
```

可用 `directory` 修改路径。JSON 使用稳定排序，并通过临时文件加 rename 原子写入。
文件中不包含绝对路径、时间戳、API key、完整 Prompt 或 Provider 原始响应。

## Dev 与 Build

- **Dev**：渐进式。只有浏览器实际请求到的模块才会进入 ProjectState，并更新对应
  extracted、cache 与 locales。
- **Build**：使用全新 ProjectState，跟随入口可达模块图完整提取，并写回三类文件。

两种模式都会更新工作区中的协议文件。

## 应该提交什么

`i18n/cache.json`、`i18n/extracted/**`、`i18n/locales/**` **都应提交到 Git**。

推荐流程：

1. 运行 `vite dev` 并访问相关页面，或运行 `vite build`，生成最新协议文件。
2. 人工或 Agent **只修改** extracted 中对应语言的 `translations`，保留
   `id`、`source` 和 `comment`。
3. 再跑一次 Dev 或 Build。插件会读取磁盘变更，合并进 cache，并同步活动
   extracted 与 locales。
4. 源码与三类 i18n 文件一起提交，避免只提交派生文件的一部分。

分支合并时请保留 `cache.json`。它承载文件移动或删除后的 Translation Memory。
合并后重新执行 Dev 或 Build 以校准。同一 message 与 locale 若出现不同的非空翻译，
会报冲突，必须人工决定；插件不会采用后写覆盖。

## Agent 协作边界

- Agent 应修改 extracted，而不是把手工修改的 cache 或 locales 当作权威来源。
- 使用 MCP 时，写入同样只落在 extracted。详见 [AI 工具接入](../ai-tools/)。
- 使用约定以本文档为准，不以仓库内部设计笔记替代。
