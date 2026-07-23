# @ai-i18n/openai

基于 LangChain `ChatOpenAI` 的 OpenAI-compatible ai-i18n Provider。供应商、地址和模型必须
显式配置；API key 可省略以连接本地服务。

```ts
import { openAI } from '@ai-i18n/openai'

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  apiKey: process.env.AI_API_KEY,
  model: process.env.AI_MODEL!,
  systemPrompt: '按请求 locale 翻译输入文案并保持产品术语一致。',
  temperature: 1,
  maxTokens: 4096,
  timeoutMs: 120_000,
  maxRetries: 3,
  headers: { 'x-provider-version': '2026-07-23' },
  langSmith: process.env.LANGSMITH_API_KEY
    ? {
        apiKey: process.env.LANGSMITH_API_KEY,
        project: 'ai-i18n',
      }
    : undefined,
})
```

`temperature`、`timeoutMs`、`maxRetries` 默认分别为 `1`、`120_000`、`3`；`maxTokens`
不设置时交给模型决定。Provider 使用内部 JSON Schema 结构化响应，并在用户提示词尾部固定
追加纯 JSON 约束和最小示例，然后严格校验每个 `messageId + locale` 结果。传入
`langSmith` 即启用 tracing，不传则不会创建 LangSmith client。

Vite 调度层默认按 `JSON.stringify({ requests }).length` 达到 `12_000` 时成批，并把并发请求
限制为 `5`；单条超限文案独立成批。
