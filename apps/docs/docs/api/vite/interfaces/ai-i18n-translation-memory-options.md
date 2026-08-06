---
title: AiI18nTranslationMemoryOptions
description: 选择 Translation Memory 存储
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nTranslationMemoryOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nTranslationMemoryOptions {
  storage?: 'json' | 'sqlite';
}
```

## 字段

| 字段      | 默认值   | 作用                                               |
| --------- | -------- | -------------------------------------------------- |
| `storage` | `'json'` | 使用项目内可提交的分片 JSON，或用户级全局 SQLite。 |

`storage: 'sqlite'` 使用用户目录中的同一个本地数据库，在不同项目间复用唯一译文候选。数据库不在
项目目录内，也不应提交 Git；`overrides.json` 仍保留在项目内并拥有最高优先级。

Provider 的进程级刷新通过 `provider.cache` 配置，不属于存储选项，也不影响 MCP。完整行为和选型建议见
[Translation Memory](/guide/advanced/translation-memory)。
