---
title: AiI18nCacheOptions
description: 限制历史 Translation Memory 的容量
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nCacheOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nCacheOptions {
  maxMessages?: number;
  maxBytes?: number;
}
```

## 字段

| 字段          | 类型     | 默认值 | 作用                                                      |
| ------------- | -------- | ------ | --------------------------------------------------------- |
| `maxMessages` | `number` | 不限制 | Translation Memory 中最多保留的消息数。                   |
| `maxBytes`    | `number` | 不限制 | 稳定序列化后逻辑 Translation Memory 快照的 UTF-8 软上限。 |

两个字段都必须是正整数。省略两项时不启用容量淘汰；同时配置时，输出需要满足两个限制。

插件先合并磁盘编辑并执行 missing source 清理，再按 message ID 稳定淘汰当前源码不再引用的
Translation Memory。现有 extracted 或 ProjectState 引用的消息属于活动数据，不参与淘汰。

活动数据自身超限时，插件会保留数据并输出 warning，因此这些字段是保护数据安全的软上限。
`cleanup.orphanMessages: true` 会先删除全部非活跃消息。

文件提交规则见[生成文件与 Git](/guide/basic/directory)。容量限制与清理策略仅在需要控制历史
译文规模时再配置。
