---
title: Translation Memory
description: 使用项目 JSON 保存译文，并用可选 SQLite 缓存跨项目复用候选
---

Translation Memory 保存 Provider 或 Agent 产生的自动译文。项目自动译文始终写入
`i18n/translations/`，人工确认的最终措辞写入 `i18n/overrides/`，并优先于自动译文。

## 项目 JSON 是唯一事实来源

`translations/` 按目标语言和稳定 SHA-256 身份保存分桶 JSON。身份哈希的第一个十六进制字符决定
`<locale>/<0-f>.json` 路径，因此每种语言最多有 16 个非空分桶，不需要集中清单。桶内条目继续使用
完整哈希键，Git 冲突时可以区分同一桶中的不同目标；真正修改同一个键时需要确认最终译文。
分桶顶层字段和每个条目的协议字段采用固定顺序，完整哈希键按固定码元排序。因此 Provider、MCP
或 Vite 更新译文时，只会产生与内容及哈希位置有关的稳定 diff，不会因为对象字段重排制造额外变更。

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

容量策略只淘汰当前源码不再引用的历史消息；活动消息始终保留，因此限制是软上限。容量不包含
`overrides/`、`extracted/` 或 `locales/`。完整字段见
[`AiI18nTranslationMemoryCapacityOptions`](/api/vite/interfaces/ai-i18n-translation-memory-capacity-options)。

## 可选：个人 SQLite 候选缓存

希望同一台电脑上的多个项目复用历史译文时，可以增加 SQLite 候选缓存：

```bash
pnpm add -D @ai-i18n/sqlite@alpha
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

SQLite 是附加缓存，不是另一种项目存储模式。项目缺少某个自动译文时，插件会按原文、源语言、目标
语言和 `comment` 精确查询缓存：

1. 只有一个不同候选时，插件将它补写到项目 `translations/`，再提供给构建和 Runtime。
2. 没有候选或存在多个不同候选时，保持缺失，并交给 Provider 或人工处理。
3. Provider 生成的新译文先写入项目 JSON，再回填个人缓存。

因此删除数据库只会降低跨项目复用率，不会改变已经写入项目的译文或 CI 构建结果。项目不会生成
`storage.json`，MCP 也始终读写项目 JSON，不直接依赖个人缓存。

`better-sqlite3` 只属于 `@ai-i18n/sqlite`。未配置缓存的项目不需要安装该包，也不会通过 Core 或 Vite
获得原生 SQLite 依赖。

默认数据库文件为 `translation-memory.sqlite`：macOS 位于
`~/Library/Application Support/ai-i18n/`，Linux 位于 `$XDG_DATA_HOME/ai-i18n/` 或
`~/.local/share/ai-i18n/`，Windows 位于 `%LOCALAPPDATA%\ai-i18n\`。可以通过
`AI_I18N_DATA_DIR` 或 `sqlite({ dataDirectory })` 指定其他目录；不要把数据库放进仓库。

## SQLite 未复用译文时如何排查

1. 确认 Vite 配置使用 `translationMemory.cache: sqlite()`。
2. 确认当前项目安装了 `@ai-i18n/sqlite`，并且 `better-sqlite3` 适配当前 Node.js 平台。
3. 检查 `AI_I18N_DATA_DIR` 或显式 `dataDirectory` 是否指向预期数据库目录。
4. 运行一次完整 `vite build`，确认目标文案属于当前应用入口可达的模块。
5. 核对原文、源语言、目标语言和 `comment`；任一项不同都会产生不同候选。
6. 确认是否存在多个不同译法。缓存不会用时间或写入顺序自动选择。
7. 检查项目 `overrides/`；人工译文优先级更高，可能遮盖自动译文。

缓存不可用时插件继续使用项目 JSON 和 Provider，并输出 warning。需要重置个人缓存时，先停止正在
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

`fresh` 只要求当前 Vite 进程向 Provider 刷新一次已有自动译文。新结果会写入项目分片，并在启用
SQLite 时回填个人缓存；普通 HMR 和重复模块访问不会持续调用模型。完成重译后通常改回默认 `reuse`。

`provider.cache` 与 `translationMemory.cache` 含义不同：前者控制当前进程是否刷新 Provider，后者
提供跨项目的候选查询。两者都不会覆盖人工 `overrides/`。若只想重置少量自动译文，使用 MCP 清除
工具更合适。
