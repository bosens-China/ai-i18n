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

每次调用 `openAI()` 都会创建独立的惰性日志 session，但日志默认关闭。Vite 的
`provider.logging` 显式启用后的第一个模型批次才生成文件。Dev/HMR 或 Build Watch 复用同一个
translator 时，后续响应会追加到同一文件。

日志以批次生命周期、REQUEST、RESPONSE、VALIDATION 和 ERROR 块组织。Vite 调度时，同一批次从
BATCH SCHEDULED、REQUEST、RESPONSE、VALIDATION、STATE APPLIED 到 PERSISTED 使用相同
`batchId`；失败则记录 BATCH FAILED。REQUEST 展示实际 messages，RESPONSE 完整保留每个 choice
的 assistant message，包括兼容服务提供的 reasoning、tool calls、refusal 和未知扩展字段，但过滤
SDK runtime 与常规传输噪声。并发调用使用独立异步上下文，日志块不会串到其他批次。

经过 Vite 使用时，设置 `provider.logging: true` 使用 Vite root 下的 `logs/`，也可以用字符串指定
相对或绝对目录。完整阅读方法见
[LLM 日志与排障](/guide/advanced/llm-logs)。

Provider 使用 OpenAI-compatible JSON mode。目标语言和批次长度会生成本批唯一的结构化 Schema；
同一 Schema 同时约束模型输出并校验实际响应，因此返回对象的顶层字段、数组长度、语言键和译文
类型都必须精确匹配，额外字段也会被拒绝。占位符一致性在结构校验后单独检查。模型服务需要支持
Chat Completions 和 `response_format: { type: "json_object" }`。

完整接入流程见 [AI 翻译](/guide/advanced/ai-translation)。
