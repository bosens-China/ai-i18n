# @ai-i18n/openai

基于标准 `fetch` 的 OpenAI-compatible ai-i18n Provider，不依赖 OpenAI SDK，也不提供默认
供应商、模型或业务 Prompt。

```ts
import { openAI } from '@ai-i18n/openai'

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL!,
  prompt: '按请求 locale 翻译输入文案。',
})
```

Provider 使用 JSON Schema 结构化响应，并严格校验每个 `messageId + locale` 结果。
