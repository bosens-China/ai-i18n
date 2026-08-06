---
title: AiI18nTranslationMemoryCapacityOptions
description: 限制当前项目历史 Translation Memory 的容量
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nTranslationMemoryCapacityOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nTranslationMemoryCapacityOptions {
  maxMessages?: number;
  maxBytes?: number;
}
```

## 字段

| 字段          | 类型     | 默认值 | 作用                                         |
| ------------- | -------- | ------ | -------------------------------------------- |
| `maxMessages` | `number` | 不限制 | 最多保留的 Translation Memory 消息数。       |
| `maxBytes`    | `number` | 不限制 | Memory 快照稳定序列化后的 UTF-8 字节软上限。 |

两个字段都必须是正整数。两项同时存在时，Memory 需要同时满足两个限制。容量统计包含当前项目的
Translation Memory 元数据与消息，不包含 `overrides`、`extracted` 或 `locales`。JSON 与 SQLite
使用相同的逻辑快照计算方式。

插件只淘汰当前源码不再引用的消息。活动消息始终保留；活动消息自身超限时，插件输出 warning，因此
这两个字段是保护数据安全的软上限。`cleanup.orphanMessages: true` 会先删除全部非活跃消息。

## 用法

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translationMemory: {
    storage: 'json',
    capacity: {
      maxMessages: 20_000,
      maxBytes: 10 * 1024 * 1024,
    },
  },
});
```
