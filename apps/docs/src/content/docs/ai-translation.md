---
title: AI 翻译
description: 配置 translator 与 @boses/openai Provider
---

Provider 没有默认厂商或模型。配置 `translator` 后，Dev 与 Build 都会自动调度缺失翻译。

## 接入 OpenAI-compatible Provider

```ts
import { openAI } from '@boses/openai';
import { aiI18n } from '@boses/vite';

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL!,
  systemPrompt: '把输入文案翻译到请求的 locale，并保持产品术语一致。',
  temperature: 1,
  maxTokens: 4096,
  timeoutMs: 120_000,
  maxRetries: 3,
});

export default {
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      translator,
    }),
  ],
};
```

要点：

- `baseURL` 与 `model` 必填。`apiKey` 可省略，以便连接本地无认证服务。
- `systemPrompt` 可覆盖默认提示词。**纯 JSON 输出约束始终由 Provider 追加在尾部。**
- 默认 `temperature`、`timeoutMs`、`maxRetries` 分别为 `1`、`120_000`、`3`。
- 传入 `langSmith: { apiKey, project?, endpoint?, workspaceId? }` 才会启用 tracing。

## 调度行为

Vite 侧默认行为如下：

- Dev 防抖约 `100` ms
- 按序列化请求长度 `12,000` 成批
- 最多并发 `5` 个请求；单条超长文案独立成批
- Dev 不阻塞首屏；Build 结束前等待必要批次

可用 `provider: { debounceMs, batchLength, maxConcurrency }` 调整。

## 自定义 Translator

也可以实现 `@boses/core` 的 `Translator` 接口，自行对接任意翻译后端。
返回值需覆盖每个 `messageId + locale`。无法可靠翻译时，可返回 `null`。
