---
title: Translation Memory
description: 选择分片 JSON 或全局 SQLite，并控制 Provider 的进程级刷新
---

Translation Memory 保存 Provider 或 Agent 产生的自动译文。人工确认的最终措辞仍保存在项目内的
`overrides.json`，并始终优先于 Translation Memory。

## 默认：分片 JSON

默认配置会把自动译文写入 `i18n/translations/`。消息按稳定的 SHA-256 哈希前缀分片。新增或修改一条
译文只会影响对应分片和清单，适合在 PR 中审查。旧版单文件 `i18n/translations.json` 会在下一次
运行时自动迁移。

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    storage: 'json',
  },
});
```

分片文件与 `overrides.json` 应随源码提交。JSON 是默认存储，因此项目内不会生成 `storage.json`。
不要按行数手工移动消息；插件会稳定决定每条消息所在的分片。

`capacity` 只在需要限制历史译文时配置：

```ts
translationMemory: {
  storage: 'json',
  capacity: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
}
```

它会淘汰当前源码不再引用的消息；活动消息始终保留，因此容量是软上限。容量计算不包含
`overrides.json`、`extracted/` 或 `locales/`。完整字段见
[`AiI18nTranslationMemoryCapacityOptions`](/api/vite/interfaces/ai-i18n-translation-memory-capacity-options)。

## 可选：用户级全局 SQLite

希望同一台电脑上的多个项目共享自动译文时，可以选择 SQLite：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    storage: 'sqlite',
  },
});
```

数据库位于当前用户的数据目录，不会写入项目，也不需要提交 Git。项目内会保留一个小型
`storage.json`，让 Vite 与 MCP 选择 SQLite。SQLite 只在同一原文、源语言、目标语言和
`comment` 只有一个候选时自动跨项目复用；存在多个不同译法时保持缺失，交给 Provider 或人工审校。

默认数据库文件为 `translation-memory.sqlite`：macOS 位于
`~/Library/Application Support/ai-i18n/`，Linux 位于 `$XDG_DATA_HOME/ai-i18n/` 或
`~/.local/share/ai-i18n/`，Windows 位于 `%LOCALAPPDATA%\ai-i18n\`。

SQLite 是本机可丢弃缓存，不替代项目内的 `overrides.json`，也不是跨机器或团队同步服务。CI 或新电脑
没有该数据库时，可以由 Provider 重新生成自动译文。

## 模型或提示词变化后刷新一次

ai-i18n 不会根据 `model`、`baseURL`、温度或提示词自动失效缓存。自定义 `Translator` 可以封装任意
逻辑，插件无法可靠生成既安全又稳定的配置指纹，也不会把密钥或提示词写入项目文件。

需要用新配置重跑时，将 Provider 缓存策略临时设为 `fresh`：

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  provider: {
    translator,
    cache: 'fresh',
  },
});
```

`fresh` 与 Dev/Build 无关。它只要求当前 Vite 进程向 Provider 刷新一次已有自动译文。历史译文仍可供
Runtime 使用；本进程新生成的结果会持久化并立即复用，普通 HMR 和重复模块访问不会持续调用模型。
重新启动时，如果仍保留 `fresh`，会再刷新一次；完成重译后通常改回默认的 `reuse`。

`provider.cache` 不属于 Translation Memory 存储配置，也不会传给 Translator。MCP 与 AI Agent 在
`storage.json` 缺失时读写分片 JSON，存在 SQLite 标记时读写全局数据库；在途 Agent 写入不会被旧
Provider 请求覆盖。`fresh` 也不会删除或覆盖人工 `overrides`。若只想重置少量自动译文，使用 MCP
的清除工具更合适。

## 切换存储

修改 `storage` 后，插件会迁移当前项目的 Translation Memory。切换到 SQLite 时创建
`storage.json`，切回 JSON 时删除该文件。切换前请停止其他正在写入该项目的 Vite 或 MCP 进程，
完成后检查生成文件和关键页面。

全局数据库目录可以通过 `AI_I18N_DATA_DIR` 覆盖，主要用于隔离 CI、容器或测试环境。不要把该目录
放进仓库。
