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
  storage?: 'json' | TranslationMemoryStorageAdapter;
  capacity?: AiI18nTranslationMemoryCapacityOptions;
}
```

## 字段

| 字段       | 类型                                                                                                         | 默认值   | 作用                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------- |
| `storage`  | `'json' \| TranslationMemoryStorageAdapter`                                                                  | `'json'` | 使用项目内分片 JSON，或注入可选存储适配器。 |
| `capacity` | [`AiI18nTranslationMemoryCapacityOptions`](/api/vite/interfaces/ai-i18n-translation-memory-capacity-options) | 不限制   | 限制当前项目保留的历史译文容量。            |

SQLite 由独立的 `@ai-i18n/sqlite` 包提供：

```ts
import { sqlite } from '@ai-i18n/sqlite';

translationMemory: {
  storage: sqlite(),
}
```

没有安装并注入该包时，核心依赖不会包含 `better-sqlite3`。SQLite 数据库不在项目目录内，也不应
提交 Git；`overrides.json` 仍保留在项目内并拥有最高优先级。

Provider 的进程级刷新通过 `provider.cache` 配置，不属于存储选项，也不影响 MCP。完整行为和选型建议见
[Translation Memory](/guide/advanced/translation-memory)。
