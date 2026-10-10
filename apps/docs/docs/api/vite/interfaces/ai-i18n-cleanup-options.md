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

| 字段                 | 默认值                          | 作用                                            |
| -------------------- | ------------------------------- | ----------------------------------------------- |
| `missingSourceFiles` | `true`                          | 删除源文件不存在时对应的 `extracted` 文件。     |
| `orphanMessages`     | Build 为 `true`，Dev 为 `false` | 删除当前源码不再引用的历史 Translation Memory。 |

完整 Build（包括 Watch 重建）默认在确认入口模块图后删除当前项目的全部非活跃消息，再执行容量淘汰。
需要先审查历史译文时，设置 `orphanMessages: false` 后再运行完整 Build；Dev 默认保留历史译文。
清理不会删除
`overrides/`，也不会删除个人 SQLite 缓存中的候选。

修改清理策略后，运行一次完整 Build，确认当前入口可达模块已完成提取。
