---
title: 翻译记忆
description: 项目 JSON 保存译文，SQLite 缓存跨项目复用候选
---

以下介绍本地翻译模式。启用 [`remote.load`](/guide/advanced/remote-translations) 后，
默认 replace 模式中，远程快照替代自动译文来源，不使用本地 Translation Memory 或 SQLite；人工 overrides 仍优先。
overlay 模式保留本地 Translation Memory 和 SQLite，以远程有效译文覆盖本地人工及自动结果；远程值不写入本地存储。

翻译记忆保存 Provider 或 Agent 产生的自动译文。本地模式的项目自动译文始终写入
`i18n/translations/`，人工确认的最终措辞写入 `i18n/overrides/`，并优先于自动译文。

## 项目 JSON 是唯一事实来源

`translations/` 按目标语言和稳定 SHA-256 身份保存分桶 JSON。身份哈希的第一个十六进制字符决定
`<locale>/<0-f>.json` 路径。因此每种语言最多有 16 个非空分桶，不需要集中清单。
桶内条目继续使用完整哈希键，Git 冲突时可以区分同一桶中的不同目标；真正修改同一个键时需要确认最终译文。

分桶顶层字段和每个条目的协议字段采用固定顺序，完整哈希键按固定码元排序。
因此 Provider、MCP 或 Vite 更新译文时，只会产生与内容及哈希位置有关的稳定 diff。
对象字段重排不会制造额外变更。

这些文件应随源码提交。团队成员、CI 和发布环境只依赖仓库内容，不依赖某台电脑上的数据库。

容量限制仍通过 `capacity` 配置：

```ts
translationMemory: {
  capacity: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
}
```

容量策略只淘汰当前源码不再引用的历史消息。活动消息始终保留，因此限制是软上限。
容量不包含 `overrides/`、`extracted/` 或 `locales/`。完整字段见
[`AiI18nTranslationMemoryCapacityOptions`](/api/vite/interfaces/ai-i18n-translation-memory-capacity-options)。

## 可选：个人 SQLite 候选缓存

希望同一台电脑上的多个项目复用历史译文时，可以增加 SQLite 候选缓存。安装前请确认
[版本选择与升级](/guide/getting-started/versions)中的发布状态：

```bash
pnpm add -D @ai-i18n/sqlite@^1.0.0
```

```ts
import { sqlite } from '@ai-i18n/sqlite';

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    cache: sqlite(),
  },
});
```

SQLite 是附加缓存，不是另一种项目存储模式。启用后，已有自动译文与人工覆盖都会按项目同步。
项目按翻译目录的真实路径区分；不同 clone、worktree 或移动后的目录是不同来源。
默认同库项目互相提供候选；需要隔离时使用不同的 `dataDirectory`。

Dev 和 Build 在请求 Provider 前，按原文、源语言、目标语言和 `comment` 精确查询：

1. 去重后只有一个译值，且至少有一个自动译文来源时，先补写项目 `translations/` 再使用。
2. 存在不同译值或只有人工校对来源时，不自动选择；有 Provider 就继续翻译，否则回退原文。
3. 不覆盖项目已有译文；空字符串也是有效译文。Provider 新结果先提交项目 JSON，再同步缓存。

人工校对保存原作用范围，只供选择；来源项目的文件或位置范围不会自动套用到新项目。
同项目改译或清空后旧自动值退出候选；人工覆盖删除后对应候选撤销。其他项目的相同译值仍可用。
自动译文从项目 JSON 消失后默认留作历史候选，查询不检查来源项目是否仍存在。
需要同步时清理当前项目这类历史记录，可设置：

```ts
translationMemory: {
  cache: sqlite({ pruneOrphans: true }),
}
```

`pruneOrphans` 默认 `false`，只影响当前项目缓存，与 Build 对项目 JSON 的孤儿清理独立。
SQLite 不设置容量上限或自动按时间淘汰；`translationMemory.capacity` 只限制项目 JSON。

MCP 独立修改译文后，会解析目标应用配置并同步已启用的缓存，不运行 Provider。
翻译目录位于应用外时，需要同时提供目标应用目录；找不到配置时在下次 Dev/Build 同步。
同项目同步串行且读取最新项目文件；缓存故障只影响复用，不回滚项目译文。

人工挑选可以通过 Agent 查询候选，或在审查工作台的“历史候选”中查看来源、填入草稿。
工作台不自动选择；点击确认后才按当前范围保存为人工译文。相同译值合并来源，并可加载更多结果。
也可以让 Agent 列出缓存项目、预览并执行指定项目孤儿、整个项目或全库清理。
清理只删除个人缓存，项目 JSON 不受影响；项目下次同步可以重新贡献现有译文。

删除数据库只降低复用率，
不会改变已提交项目译文或 CI 构建。项目不会生成 `storage.json`。
候选查询本身只读，不同步、采用或清理译文。

`better-sqlite3` 只属于 `@ai-i18n/sqlite`。未配置缓存的项目不需要安装该包，也不会通过 Core 或 Vite
获得原生 SQLite 依赖。

默认数据库文件为 `translation-memory.sqlite`：

- macOS：`~/Library/Application Support/ai-i18n/`
- Linux：`$XDG_DATA_HOME/ai-i18n/` 或 `~/.local/share/ai-i18n/`
- Windows：`%LOCALAPPDATA%\ai-i18n\`

可以通过 `AI_I18N_DATA_DIR` 或 `sqlite({ dataDirectory })` 指定其他目录。不要把数据库放进仓库。

## SQLite 未复用译文时如何排查

1. 确认 Vite 配置使用 `translationMemory.cache: sqlite()`。
2. 确认当前项目安装了 `@ai-i18n/sqlite`，并确认 `better-sqlite3` 适配当前 Node.js 平台。
3. 检查 `AI_I18N_DATA_DIR` 或显式 `dataDirectory` 是否指向预期数据库目录。
4. 运行一次完整 `vite build`，确认目标文案属于当前应用入口可达的模块。
5. 核对原文、源语言、目标语言和 `comment`；任一项不同都会产生不同候选。
6. 确认是否存在多个不同译法，或只有人工来源。缓存不会用时间或写入顺序自动选择。
7. 检查项目 `overrides/`；人工译文优先级更高，可能遮盖自动译文。

缓存不可用时插件继续使用项目 JSON 和 Provider，并输出 warning。若缓存打开时暂时失败，插件会在
下次同步时重试，无需重启 Vite。需要重置个人缓存时，先停止正在
使用数据库的 Vite 进程，再删除数据库。项目分片与人工译文不受影响。

## 模型或提示词变化后刷新一次

ai-i18n 不会根据 `model`、`baseURL`、温度或提示词自动失效已有项目译文。需要用新配置重跑时，将
Provider 缓存策略临时设为 `fresh`：

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

`fresh` 只要求当前 Vite 进程向 Provider 刷新一次已有自动译文。新结果会写入项目分片。
在启用 SQLite 时，新结果还会回填个人缓存。普通 HMR 和重复模块访问不会持续调用模型。
完成重译后通常改回默认 `reuse`。

如果模型请求期间通过 MCP 或其他方式修改了同一个自动译文，插件会保留项目中较新的值。
它不会用该请求的旧结果覆盖它。清空译文和空字符串也按已保存的修改处理。

`provider.cache` 与 `translationMemory.cache` 含义不同。前者控制当前进程是否刷新 Provider，后者
提供跨项目的候选查询。两者都不会覆盖人工 `overrides/`。若只想重置少量自动译文，使用 MCP 清除
工具更合适。
