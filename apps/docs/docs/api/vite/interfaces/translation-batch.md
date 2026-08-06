---
title: TranslationBatch
description: Translator 单次调用接收的语言和消息批次
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationBatch } from '@ai-i18n/vite';
```

## 定义

```ts
interface TranslationBatch {
  batchId?: string;
  logging?: TranslationLogging;
  locales: readonly string[];
  messages: readonly TranslationMessage[];
}
```

## 字段

| 字段       | 类型                                                                        | 必填 | 作用                              |
| ---------- | --------------------------------------------------------------------------- | ---- | --------------------------------- |
| `batchId`  | `string`                                                                    | 否   | 本批诊断 ID；由 Vite 调度器生成。 |
| `logging`  | [`TranslationLogging`](/api/vite/type-aliases/translation-logging)          | 否   | 关闭日志，或给出已解析日志目录。  |
| `locales`  | `readonly string[]`                                                         | 是   | 本批所有消息共同缺失的语言。      |
| `messages` | [`readonly TranslationMessage[]`](/api/vite/interfaces/translation-message) | 是   | 按固定下标排列的消息。            |

Vite 按缺失 locale 集合分组，再根据 `AiI18nProviderOptions.batchLength` 切分批次。
`batchId` 只用于把调度、模型日志、状态应用和持久化事件关联起来，不发送给模型，也不参与
message ID、缓存键或 Translation Memory 文件格式。直接调用 Provider 时，Provider 可以为缺失的
`batchId` 生成本地诊断 ID。

Vite 根据 `provider.logging` 传入 `logging`。启用时，字符串是基于 Vite root 解析后的绝对目录；
关闭时为 `false`。自定义 Translator 可以忽略该可选字段；官方 OpenAI Provider 在值为 `false` 时
仍执行翻译，但不创建或追加日志。
