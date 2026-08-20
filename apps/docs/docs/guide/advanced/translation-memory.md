---
title: Translation Memory
description: 选择分片 JSON 或全局 SQLite，并控制 Provider 的进程级刷新
---

Translation Memory 保存 Provider 或 Agent 产生的自动译文。人工确认的最终措辞仍保存在项目内的
`overrides.json`，并始终优先于 Translation Memory。

## 默认：分片 JSON

默认配置会把自动译文写入 `i18n/translations/`。消息按稳定的 SHA-256 哈希前缀分片。新增或修改一条
译文只会影响对应分片和清单，适合在 PR 中审查。团队提交这些文件后，其他开发者和 CI 可以复用相同的
自动译文。旧版单文件 `i18n/translations.json` 会在下一次运行时自动迁移。

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

先安装可选适配器：

```bash
pnpm add -D @ai-i18n/sqlite@alpha
```

```ts
import { sqlite } from '@ai-i18n/sqlite';

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    storage: sqlite(),
  },
});
```

数据库位于当前用户的数据目录，不会写入项目，也不需要提交 Git。项目内会保留一个小型
`storage.json`，让 Vite 与 MCP 选择 SQLite。

`better-sqlite3` 只属于 `@ai-i18n/sqlite`。继续使用默认 JSON 的项目不需要安装该包，也不会因为
安装 `@ai-i18n/core` 或 `@ai-i18n/vite` 而获得原生 SQLite 依赖。

当前项目已有自动译文时，SQLite 会继续使用该译文。当前项目尚无译文时，SQLite 才会查找跨项目候选。
原文、源语言、目标语言和 `comment` 必须完全一致。只有一个候选时，SQLite 会自动复用。存在多个不同
译法时，SQLite 会保持缺失，并交给 Provider 或人工校对。

默认数据库文件为 `translation-memory.sqlite`：macOS 位于
`~/Library/Application Support/ai-i18n/`，Linux 位于 `$XDG_DATA_HOME/ai-i18n/` 或
`~/.local/share/ai-i18n/`，Windows 位于 `%LOCALAPPDATA%\ai-i18n\`。

SQLite 是本机可丢弃缓存，不替代项目内的 `overrides.json`，也不是跨机器或团队同步服务。CI 或新电脑
没有该数据库时，可以由 Provider 重新生成自动译文。

## SQLite 未复用译文时如何排查

按以下顺序检查：

1. 检查项目内是否存在 `i18n/storage.json`。缺少该文件表示当前项目使用分片 JSON。
2. 确认当前项目安装了 `@ai-i18n/sqlite`，且 Vite 配置注入了 `sqlite()`。MCP 会根据 marker 从项目
   依赖中解析同一个包。
3. 检查 `AI_I18N_DATA_DIR` 是否已设置。已设置时，数据库位于该目录；否则使用当前平台的默认目录。
4. 运行一次完整 `vite build`，确认目标文案属于当前应用入口可达的模块。
5. 核对原文、源语言、目标语言和 `comment`。其中任意一项不同，都会产生不同的候选。
6. 确认是否存在多个不同译法。SQLite 不会从多个候选中猜测结果，因此会让该译文保持缺失。
7. 检查项目内的 `overrides.json`。人工译文拥有最高优先级，可能遮盖 SQLite 中的自动译文。

`provider.cache: 'fresh'` 会让当前 Vite 进程刷新自动译文，但不会解决候选冲突。请勿直接编辑 SQLite
数据库。需要重置本机缓存时，请先停止正在使用该数据库的 Vite 与 MCP 进程。删除数据库会清除本机的
自动译文缓存，后续可以由 Provider 重新生成；项目内的 `overrides.json` 不受影响。

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

把 `storage` 从默认 JSON 改为 `sqlite()` 后，插件会迁移当前项目的 Translation Memory 并创建
`storage.json`。切回 JSON 时移除 `storage` 或设置为 `'json'`，插件会在仍能解析已安装 SQLite
适配器的情况下迁移并删除 marker。切换前请停止其他正在写入该项目的 Vite 或 MCP 进程，
完成后检查生成文件和关键页面。

全局数据库目录可以通过 `AI_I18N_DATA_DIR` 覆盖，主要用于隔离 CI、容器或测试环境。不要把该目录
放进仓库。
