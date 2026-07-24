---
title: MCP 工具
description: '@ai-i18n/mcp 三个工具的参数、默认值、输出与写入边界'
---

`@ai-i18n/mcp` 提供本地 stdio MCP server，注册时不需要项目路径。Codex、Claude Code、
Cursor 与 Antigravity 的注册方式见
[AI 工具接入](../../ai-tools/)。

## 通用参数

| 参数             | 类型     | 必填 | 默认值     | 作用                          |
| ---------------- | -------- | ---- | ---------- | ----------------------------- |
| `i18n_directory` | `string` | 是   | 无         | 最终协议目录的绝对路径。      |
| `cursor`         | `string` | 否   | 第一页     | 上一页返回的不透明游标。      |
| `limit`          | `number` | 否   | 因工具而异 | 每页数量，范围为 `1`～`200`。 |

不要根据目录名猜测 `i18n_directory`。应先读取 Vite `root` 与
`aiI18n({ directory })`，再解析出最终绝对路径。相对路径会被拒绝。

## `ai_i18n_list_translation_files`

列出仍包含有效 `null` 翻译的源码文件。

| 参数             | 类型     | 必填 | 默认值       | 作用             |
| ---------------- | -------- | ---- | ------------ | ---------------- |
| `i18n_directory` | `string` | 是   | 无           | 协议目录。       |
| `locale`         | `string` | 否   | 全部目标语言 | 只统计指定语言。 |
| `cursor`         | `string` | 否   | 第一页       | 分页游标。       |
| `limit`          | `number` | 否   | `50`         | 每页文件数。     |

输出包含 `items`、`next_cursor` 和 `total`。每个文件项包含文件路径与缺失数量。

## `ai_i18n_list_translations`

读取一个文件或整个项目的有效翻译消息。

| 参数             | 类型      | 必填 | 默认值         | 作用                          |
| ---------------- | --------- | ---- | -------------- | ----------------------------- |
| `i18n_directory` | `string`  | 是   | 无             | 协议目录。                    |
| `file`           | `string`  | 否   | 全项目去重视图 | 限定一个 `extracted` 源文件。 |
| `locale`         | `string`  | 否   | 全部语言       | 只返回指定语言。              |
| `missing_only`   | `boolean` | 否   | `true`         | 只返回值为 `null` 的条目。    |
| `cursor`         | `string`  | 否   | 第一页         | 分页游标。                    |
| `limit`          | `number`  | 否   | `100`          | 每页消息数。                  |

## `ai_i18n_write_translations`

原子填充一个 `extracted` 文件中的缺失翻译。

| 参数             | 类型                 | 必填 | 默认值 | 作用                          |
| ---------------- | -------------------- | ---- | ------ | ----------------------------- |
| `i18n_directory` | `string`             | 是   | 无     | 协议目录。                    |
| `file`           | `string`             | 是   | 无     | 一个 `extracted` 源文件路径。 |
| `translations`   | `TranslationWrite[]` | 是   | 无     | `1`～`100` 条写入。           |

`TranslationWrite` 的 `message_id`、`locale` 与 `value` 都是必填字符串。

输出：

| 字段              | 类型     | 作用                               |
| ----------------- | -------- | ---------------------------------- |
| `file`            | `string` | 实际写入的文件。                   |
| `applied_count`   | `number` | 从 `null` 填充成功的数量。         |
| `unchanged_count` | `number` | 已经与目标值相同、无需修改的数量。 |

工具不会覆盖不同的非空值。写入后，运行 Vite Dev 或 Build，把变更同步到 cache、其他
extracted 文件与 locales。

Vite 的 `cache.maxMessages` 与 `cache.maxBytes` 不会改变 MCP 的参数、分页或写入边界。
MCP 写入的活动消息会受到保护。下一次 Vite 同步仍可能按照容量配置，淘汰已经没有活动引用的
历史 Translation Memory。
