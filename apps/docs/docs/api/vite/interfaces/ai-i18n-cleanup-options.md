---
title: AiI18nCleanupOptions
description: 配置生成文件和历史译文的清理策略
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nCleanupOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nCleanupOptions {
  missingSourceFiles?: boolean;
  orphanMessages?: boolean;
}
```

## 字段

| 字段                 | 默认值  | 作用                                            |
| -------------------- | ------- | ----------------------------------------------- |
| `missingSourceFiles` | `true`  | 删除源文件不存在时对应的 `extracted` 文件。     |
| `orphanMessages`     | `false` | 删除当前源码不再引用的历史 Translation Memory。 |

`orphanMessages: true` 会先删除当前项目的全部非活跃消息，再执行容量淘汰。它不会删除
`overrides/`，也不会删除个人 SQLite 缓存中的候选。

首次启用或修改清理策略后，运行一次完整 Build，确认当前入口可达模块已完成提取。
