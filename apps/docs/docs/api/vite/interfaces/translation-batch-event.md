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
interface TranslationBatchEvent {
  batchId: string;
  stage: 'scheduled' | 'state-applied' | 'persisted' | 'failed';
  logging?: false | string;
  locales?: readonly string[];
  messageCount?: number;
  resultCount?: number;
  affectedModules?: number;
  reason?: string;
}
```

`logging` 与对应 [`TranslationBatch`](/api/vite/interfaces/translation-batch) 一致。启用时是基于
Vite root 解析后的绝对日志目录；关闭时为 `false`。它只用于旁路诊断，不进入持久化协议。

## 阶段

| `stage`         | 含义                                                    |
| --------------- | ------------------------------------------------------- |
| `scheduled`     | Vite 已形成实际 Translator 批次。                       |
| `state-applied` | Provider 结果已通过校验并应用到当前项目状态。           |
| `persisted`     | 包含该批结果的文件和 Translation Memory 已写入成功。    |
| `failed`        | Translator、结果校验或后续批次处理失败；`reason` 可用。 |

其他字段按阶段提供诊断上下文。事件接收器只用于观察，不能依赖它改变翻译流程。
