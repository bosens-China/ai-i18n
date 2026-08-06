---
title: TranslationBatchEvent
description: Translator 批次的旁路诊断事件
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationBatchEvent } from '@ai-i18n/vite';
```

## 定义

```ts
type TranslationBatchEvent =
  | {
      batchId: string;
      logging: false | string;
      stage: 'scheduled';
      locales: readonly string[];
      messageCount: number;
    }
  | {
      batchId: string;
      logging: false | string;
      stage: 'state-applied';
      resultCount: number;
      affectedModules: number;
    }
  | { batchId: string; logging: false | string; stage: 'persisted' }
  | {
      batchId: string;
      logging: false | string;
      stage: 'failed';
      locales: readonly string[];
      messageCount: number;
      reason: string;
    };
```

`logging` 与对应 [`TranslationBatch`](/api/vite/interfaces/translation-batch) 一致。启用时是基于
Vite root 解析后的绝对日志目录；关闭时为 `false`。实现了 `reportBatchEvent` 的 Translator 始终接收
事件；日志关闭只表示不应写入日志文件。该字段不进入持久化协议。

## 阶段

| `stage`         | 必有字段                            | 含义                                                 |
| --------------- | ----------------------------------- | ---------------------------------------------------- |
| `scheduled`     | `locales`、`messageCount`           | Vite 已形成实际 Translator 批次。                    |
| `state-applied` | `resultCount`、`affectedModules`    | Provider 结果已通过校验并应用到当前项目状态。        |
| `persisted`     | 无                                  | 包含该批结果的文件和 Translation Memory 已写入成功。 |
| `failed`        | `locales`、`messageCount`、`reason` | Translator、结果校验或后续批次处理失败。             |

事件接收器只用于观察，不能依赖它改变翻译流程。
