---
title: AiI18nProviderOptions
description: 定义 Translator 的批次、并发与失败策略
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nProviderOptions } from '@ai-i18n/vite';
```

## 定义

```ts
type AiI18nProviderOptions = {
  translator: Translator;
  debounceMs?: number;
  batchLength?: number;
  maxConcurrency?: number;
  strict?: boolean;
};
```

## 字段

| 字段             | 类型                                              | 必填 | 默认值   | 作用                                          |
| ---------------- | ------------------------------------------------- | ---- | -------- | --------------------------------------------- |
| `translator`     | [`Translator`](/api/vite/type-aliases/translator) | 是   | 无       | 执行自动翻译。                                |
| `debounceMs`     | `number`                                          | 否   | `100`    | Dev 中合并连续请求的等待时间，单位为毫秒。    |
| `batchLength`    | `number`                                          | 否   | `12_000` | 单批序列化请求的字符长度上限，不是 token 数。 |
| `maxConcurrency` | `number`                                          | 否   | `5`      | 同时执行的翻译批次数。                        |
| `strict`         | `boolean`                                         | 否   | `false`  | 在 flush 时抛出翻译失败或仍有 `null` 的错误。 |

`debounceMs` 必须大于或等于 `0`。`batchLength` 和 `maxConcurrency` 必须是正整数。

Vite 按消息的“缺失 locale 集合”分组，再按 `batchLength` 切分。一个批次失败时，其他成功
批次仍会写入。Dev 中的模型调用不阻塞首次模块响应；Build 会在结束前等待必要批次。

## 示例

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  provider: {
    translator,
    batchLength: 12_000,
    maxConcurrency: 5,
    strict: true,
  },
});
```

Provider 的完整接入流程见 [AI 翻译](/guide/advanced/ai-translation)。
