---
title: 目录说明与工作流
description: i18n 协议目录、Git 提交约定、目录维护配置与 Agent 协作流程
---

## 目录协议

默认在 Vite root 下生成：

```text
i18n/
├── cache.json                 # 全局 Translation Memory
├── extracted/
│   └── src_example.ts.json    # source / comment / location / 各语言翻译
└── locales/
    └── en-US.json             # 只生成目标语言；缺失项保留 null
```

可用 `directory` 修改路径。JSON 使用稳定排序，并通过临时文件加 rename 原子写入。
文件中不包含绝对路径、时间戳、API key、完整 Prompt 或 Provider 原始响应。
extracted 文件位于同一层级。路径分隔符编码为 `_`，源码文件名中的 `_` 会单独转义，
因此相似路径不会互相覆盖。

`cache.json` 使用消息 ID 作为 key，只保存 Translation Memory：

```json
{
  "version": 2,
  "messages": {
    "8 位房间码": {
      "sourceLang": "zh-CN",
      "translations": {
        "en-US": "8-digit Room Code"
      }
    }
  }
}
```

插件先按当前 message ID 查找。source language 变化后，如果新 source 文案唯一匹配某条
历史 translation，插件会反向复用该消息的其他语言翻译。

## 目录维护：清理策略与容量限制

随着项目演进，你可能会关注 `cache.json` 的体积和废弃文案的清理。

```ts
aiI18n({
  // ... 其他配置
  cache: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
  cleanup: {
    missingSourceFiles: true,
    orphanMessages: false,
  },
});
```

- **容量限制 (`cache`)**：可以限制 `cache.json` 保留的最大条数或最大字节数。插件只会淘汰当前源码不再引用的非活跃历史。如果当前源码活跃引用的文案自身已经超限，插件会保留它们并抛出 warning，以此作为保护数据的软上限。
- **清理策略 (`cleanup`)**：默认 `missingSourceFiles` 为 `true`，当源文件已不存在时，会自动删除对应 `extracted` 文件。建议保持 `orphanMessages: false`，因为 `cache.json` 还承担记忆功能，过于激进地清理无引用消息会降低分支切换或文件移动后的翻译复用率。

## Dev 与 Build

- **Dev**：渐进式。只有浏览器实际请求到的模块才会进入 ProjectState，并更新对应
  extracted、cache 与 locales。
- **Build**：使用全新 ProjectState，跟随入口可达模块图完整提取，并写回三类文件。
- **Build Watch**：首轮建立 ProjectState，后续重建复用未变化 source 的 AST，只刷新变化文件、
  必要依赖方和当前入口可达模块集合。

三种模式都会更新工作区中的协议文件。

开启按需加载后，协议文件保持不变。Build 会为每个目标 locale 生成
独立的内容 hash chunk；Dev 通过相同的 locale manifest 按需提供虚拟模块。source fallback
始终位于同步路径中。

Build Watch 会监听活动模块关联的 extracted 和目标 locale 文件。外部编辑会在下一轮只合并
翻译和 registration，不重新 parse 未变化 source。插件自身的稳定写入不会造成重复内容变更。
Vite 配置、插件、extractor 或 schema 变化后需要重启 Watch 进程。

## 应该提交什么

:::important 最小可提交清单
源码变更、生成的 `src/ai-i18n.d.ts`（或自定义 `dts` 路径）、`i18n/cache.json`、
`i18n/extracted/**`、`i18n/locales/**` **应在同一 PR 中提交**。
:::

推荐流程：

1. 运行 `vite dev` 并访问相关页面，或运行 `vite build`，生成最新协议文件。
2. **人工翻译**：打开 `extracted/` 下的源文件，找到 `translations` 中对应语言为 `null` 的字段并直接填写翻译内容。请**保留** `id`、`source` 和 `comment`，**仅修改**目标语言的值。如果使用 Agent 补译，Agent 也应只遵循同样的边界修改。
3. 再跑一次 Dev 或 Build。插件会读取磁盘变更，合并进 cache，并同步活动
   extracted 与 locales。
4. 源码与三类 i18n 文件一起提交，避免只提交派生文件的一部分。

修改 Vite 配置、语言列表、插件版本、extractor/schema 或生成声明配置后，先重启 Dev/Build
Watch，再执行一次完整 Build。只通过 MCP 填充 extracted 时无需修改 `loading.strategy`；
下一次 Dev/Build 会同步 cache、重复 extracted 与 locales。

:::warning 合并冲突
分支合并时请保留 `cache.json`。它承载文件移动或删除后的 Translation Memory。
合并后重新执行 Dev 或 Build 以校准。同一 message 与 locale 若出现不同的非空翻译，
会报冲突，必须人工决定；插件不会采用后写覆盖。
:::

## Agent 协作边界

- Agent 应修改 extracted，而不是把手工修改的 cache 或 locales 当作权威来源。
- Build Watch 能恢复目标 locale 文件的外部编辑，但团队和 Agent 的规范写入入口仍是
  extracted。
- 使用 MCP 时，写入同样只落在 extracted。详见 [接入 Agent](/guide/advanced/ai-tools)。
- 使用约定以本文档为准，不以仓库内部设计笔记替代。
