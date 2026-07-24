---
title: OpenAI Provider
description: '@boses/openai 的 openAI()、提示词、LangSmith 与 Translator 契约'
---

`@boses/openai` 是可选 Provider。它通过 LangChain `ChatOpenAI` 连接
OpenAI-compatible 服务，并返回 `aiI18n()` 所需的 `Translator`。

## `openAI(options)`

```ts
import { openAI } from '@boses/openai';

const translator = openAI({
  baseURL: 'https://example.com/v1',
  model: 'model-name',
  apiKey: process.env.AI_API_KEY,
});
```

### `OpenAIOptions`

| 选项           | 类型               | 必填 | 默认值         | 作用                                              |
| -------------- | ------------------ | ---- | -------------- | ------------------------------------------------- |
| `baseURL`      | `string`           | 是   | 无             | OpenAI-compatible API 根地址，通常以 `/v1` 结尾。 |
| `model`        | `string`           | 是   | 无             | 显式选择的模型名。                                |
| `apiKey`       | `string`           | 否   | 本地占位值     | 认证密钥；本地无认证服务可省略。                  |
| `temperature`  | `number`           | 否   | `1`            | 模型 temperature，必须大于或等于 `0`。            |
| `maxTokens`    | `number`           | 否   | 由模型决定     | 单次响应 token 上限，必须是正整数。               |
| `timeoutMs`    | `number`           | 否   | `120_000`      | 单次请求超时时间，单位为毫秒。                    |
| `maxRetries`   | `number`           | 否   | `3`            | LangChain 层的最大重试次数。                      |
| `headers`      | `HeadersInit`      | 否   | 无             | 追加到 Provider 请求的 HTTP Header。              |
| `systemPrompt` | `string`           | 否   | 内置翻译提示词 | 覆盖翻译目标、术语与风格约束。                    |
| `langSmith`    | `LangSmithOptions` | 否   | 不启用         | 传入后启用 LangSmith tracing。                    |

Provider 不主动读取宿主的 `OPENAI_API_KEY`。密钥必须显式传入，省略时会使用本地服务占位值，
避免意外把宿主环境变量发送给其他地址。

## `systemPrompt`

`systemPrompt` 只需要描述翻译要求。Provider 会在末尾追加固定的 JSON Schema 输出约束，
不要在自定义提示词中重复定义返回 JSON 的字段。

推荐至少说明：

- 产品领域和目标读者；
- UI 文案的语气、长度与大小写习惯；
- 必须保持的品牌名、代码、URL 和占位符；
- 固定术语及其目标语言写法；
- 如何使用请求中的 `comment` 解决歧义。

完整示例见 [AI 翻译教程](../../ai-translation/)。

## `langSmith`

| 字段          | 类型     | 必填 | 默认值             | 作用                |
| ------------- | -------- | ---- | ------------------ | ------------------- |
| `apiKey`      | `string` | 是   | 无                 | LangSmith API key。 |
| `project`     | `string` | 否   | LangSmith 默认项目 | 写入的项目名。      |
| `endpoint`    | `string` | 否   | LangSmith 默认地址 | 自托管或代理地址。  |
| `workspaceId` | `string` | 否   | 无                 | 目标 workspace。    |

## 自定义 `Translator`

不使用 `@boses/openai` 时，可实现 `@boses/core` 导出的函数类型：

```ts
type Translator = (
  requests: readonly TranslationRequest[],
) => Promise<readonly TranslationResult[]>;
```

### `TranslationRequest`

| 字段        | 类型     | 必填 | 作用               |
| ----------- | -------- | ---- | ------------------ |
| `messageId` | `string` | 是   | 稳定消息标识。     |
| `source`    | `string` | 是   | 源文案。           |
| `comment`   | `string` | 否   | 源码中的消歧注释。 |
| `locale`    | `string` | 是   | 目标语言 `value`。 |

### `TranslationResult`

| 字段        | 类型             | 必填 | 作用                                  |
| ----------- | ---------------- | ---- | ------------------------------------- |
| `messageId` | `string`         | 是   | 对应请求的消息标识。                  |
| `locale`    | `string`         | 是   | 对应请求的目标语言。                  |
| `value`     | `string \| null` | 是   | 翻译结果；无法可靠翻译时返回 `null`。 |

返回结果必须覆盖每个 `messageId + locale` 组合，且不能包含未请求的组合。
