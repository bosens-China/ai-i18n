---
title: OpenAIOptions
description: openAI() 的模型、请求与提示词配置
---

从 `@ai-i18n/openai` 导入：

```ts
import type { OpenAIOptions } from '@ai-i18n/openai';
```

## 定义

```ts
interface OpenAIOptions {
  baseURL: string;
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
  headers?: HeadersInit;
  systemPrompt?: string;
  langSmith?: LangSmithOptions;
}
```

## 字段

| 字段           | 类型                                                            | 必填 | 默认值         | 作用                                 |
| -------------- | --------------------------------------------------------------- | ---- | -------------- | ------------------------------------ |
| `baseURL`      | `string`                                                        | 是   | 无             | OpenAI-compatible API 根地址。       |
| `model`        | `string`                                                        | 是   | 无             | 显式选择模型。                       |
| `apiKey`       | `string`                                                        | 否   | 本地占位值     | 请求认证密钥。                       |
| `temperature`  | `number`                                                        | 否   | `1`            | 模型 temperature。                   |
| `maxTokens`    | `number`                                                        | 否   | 由模型决定     | 单次响应 token 上限。                |
| `timeoutMs`    | `number`                                                        | 否   | `120_000`      | 单次请求超时，单位为毫秒。           |
| `maxRetries`   | `number`                                                        | 否   | `3`            | LangChain 层的最大重试次数。         |
| `headers`      | `HeadersInit`                                                   | 否   | 无             | 追加到 Provider 请求的 HTTP Header。 |
| `systemPrompt` | `string`                                                        | 否   | 内置翻译提示词 | 覆盖产品领域、术语和风格要求。       |
| `langSmith`    | [`LangSmithOptions`](/api/openai/interfaces/lang-smith-options) | 否   | 不启用         | 启用 LangSmith tracing。             |

`baseURL`、`model` 和显式传入的 `systemPrompt` 去除首尾空白后不能为空。`temperature` 必须
大于或等于 `0`；`maxTokens` 与 `timeoutMs` 必须是正整数；`maxRetries` 必须是非负整数。

Provider 不主动读取宿主的 `OPENAI_API_KEY`。密钥必须显式传入；省略时使用本地服务占位值，
避免意外把宿主环境变量发送到其他地址。

## systemPrompt

`systemPrompt` 只需要描述翻译要求。Provider 会追加目标语言、`source` / `comment` 输入约定、
占位符规则和固定 JSON 输出约束。

推荐说明：

- 产品领域和目标读者；
- UI 文案的语气、长度与大小写习惯；
- 必须保留的品牌名、代码、URL 和占位符；
- 固定术语及其目标语言写法；
- 如何利用 `comment` 消除歧义。

不要在自定义提示词中重复定义返回 JSON 的字段。完整示例见
[AI 翻译](/guide/advanced/ai-translation#如何编写-systemprompt)。
