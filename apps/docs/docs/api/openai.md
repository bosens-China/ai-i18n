---
title: OpenAI Provider
description: '@ai-i18n/openai 的 openAI()、提示词、LangSmith 与 Translator 契约'
---

`@ai-i18n/openai` 是可选 Provider。它通过 LangChain `ChatOpenAI` 连接
OpenAI-compatible 服务，并返回 `aiI18n()` 所需的 `Translator`。

## `openAI(options)`

```ts
import { openAI } from '@ai-i18n/openai';

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

`temperature` 会原样传给兼容服务，是否实际生效由服务、模型及其运行模式决定。

Provider 不主动读取宿主的 `OPENAI_API_KEY`。密钥必须显式传入，省略时会使用本地服务占位值，
避免意外把宿主环境变量发送给其他地址。

## `systemPrompt`

`systemPrompt` 只需要描述翻译要求。Provider 会在末尾追加目标语言、`source` / `comment`
输入约定和固定的 JSON 输出约束，不要在自定义提示词中重复定义返回 JSON 的字段。

Provider 使用 OpenAI-compatible JSON mode 请求合法 JSON，并按内部 Schema 严格校验返回
结构。兼容服务需要支持 Chat Completions 和 `response_format: { type: "json_object" }`。

模型收到的是按消息合并后的 `{ source, comment? }` 对象数组，不包含 `messageId`。模型只
翻译 `source`，`comment` 只提供语境；两个字段相互独立，因此正文中的 `#` 不会被误判。
返回值使用
`{"translations":[{"en-US":"...","ja-JP":"..."}]}` 这样的语言矩阵，数组下标与输入
下标对应。`openAI()` 收到一个批次就调用模型一次；按缺失目标 locale 集合分组、批次切分
以及写回内部 message ID 都由 Vite 负责，模型适配器不接触 message ID。

推荐至少说明：

- 产品领域和目标读者；
- UI 文案的语气、长度与大小写习惯；
- 必须保持的品牌名、代码、URL 和占位符；
- 固定术语及其目标语言写法；
- 如何使用请求中的 `comment` 解决歧义。

完整示例见 [AI 翻译教程](/guide/advanced/ai-translation)。

## `langSmith`

| 字段          | 类型     | 必填 | 默认值             | 作用                |
| ------------- | -------- | ---- | ------------------ | ------------------- |
| `apiKey`      | `string` | 是   | 无                 | LangSmith API key。 |
| `project`     | `string` | 否   | LangSmith 默认项目 | 写入的项目名。      |
| `endpoint`    | `string` | 否   | LangSmith 默认地址 | 自托管或代理地址。  |
| `workspaceId` | `string` | 否   | 无                 | 目标 workspace。    |

## 自定义 `Translator`

不使用 `@ai-i18n/openai` 时，可实现 `@ai-i18n/core` 导出的函数类型：

```ts
interface TranslationMessage {
  source: string;
  comment?: string;
}

interface TranslationBatch {
  locales: readonly string[];
  messages: readonly TranslationMessage[];
}

type TranslationResult = Readonly<Record<string, string | null>>;

type Translator = (
  batch: TranslationBatch,
) => Promise<readonly TranslationResult[]>;
```

### `TranslationBatch`

| 字段       | 类型                            | 必填 | 作用                         |
| ---------- | ------------------------------- | ---- | ---------------------------- |
| `locales`  | `readonly string[]`             | 是   | 本批所有消息共同缺失的语言。 |
| `messages` | `readonly TranslationMessage[]` | 是   | 按固定下标排列的正文和补充。 |

每条 message 必须包含 `source`，可选 `comment` 仅用于理解业务语境。

### `TranslationResult`

Translator 返回与 `messages` 等长的数组；每一行必须且只能包含 `locales` 中的语言键，
值为译文或 `null`。数组下标负责对应输入，不需要也不应返回 message ID。
