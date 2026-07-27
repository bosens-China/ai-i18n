---
title: openAI()
description: 创建 OpenAI-compatible Translator
---

从 `@ai-i18n/openai` 导入：

```ts
import { openAI } from '@ai-i18n/openai';
```

## 签名

```ts
function openAI(options: OpenAIOptions): Translator;
```

## 参数

| 参数      | 类型                                                      | 说明                       |
| --------- | --------------------------------------------------------- | -------------------------- |
| `options` | [`OpenAIOptions`](/api/openai/interfaces/open-ai-options) | 模型、服务地址和请求配置。 |

## 返回值

返回 [`Translator`](/api/vite/type-aliases/translator)，可直接传给
[`AiI18nProviderOptions.translator`](/api/vite/type-aliases/ai-i18n-provider-options)。

## 示例

```ts
import { openAI } from '@ai-i18n/openai';

const translator = openAI({
  baseURL: 'https://example.com/v1',
  model: 'model-name',
  apiKey: process.env.AI_API_KEY,
});
```

`openAI()` 对收到的每个批次调用模型一次。目标 locale 分组、批次切分、并发限制和结果写回由
`@ai-i18n/vite` 负责。

Provider 使用 OpenAI-compatible JSON mode，并校验返回数组长度、语言键和译文类型。模型服务
需要支持 Chat Completions 和 `response_format: { type: "json_object" }`。

完整接入流程见 [AI 翻译](/guide/advanced/ai-translation)。
