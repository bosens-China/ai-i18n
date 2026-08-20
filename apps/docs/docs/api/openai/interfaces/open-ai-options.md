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
  style?: string;
  langSmith?: LangSmithOptions;
}
```

## 字段

| 字段          | 类型                                                          | 必填 | 默认值             | 约束         | 作用                                 |
| ------------- | ------------------------------------------------------------- | ---- | ------------------ | ------------ | ------------------------------------ |
| `baseURL`     | `string`                                                      | 是   | 无                 | 非空         | OpenAI-compatible API 根地址。       |
| `model`       | `string`                                                      | 是   | 无                 | 非空         | 显式选择模型。                       |
| `apiKey`      | `string`                                                      | 否   | 本地服务使用占位值 | 无           | 请求认证密钥。                       |
| `temperature` | `number`                                                      | 否   | `1`                | ≥ 0          | 传给模型的 temperature。             |
| `maxTokens`   | `number`                                                      | 否   | 由模型决定         | 整数；> 0    | 单次响应 token 上限。                |
| `timeoutMs`   | `number`                                                      | 否   | `120000`           | 整数；> 0    | 单次请求超时，单位为毫秒。           |
| `maxRetries`  | `number`                                                      | 否   | `3`                | 整数；≥ 0    | LangChain 层的最大重试次数。         |
| `headers`     | `HeadersInit`                                                 | 否   | 无                 | 无           | 追加到 Provider 请求的 HTTP Header。 |
| `style`       | `string`                                                      | 否   | 无                 | 空白视为省略 | 补充产品领域、术语和语言风格偏好。   |
| `langSmith`   | [LangSmithOptions](/api/openai/interfaces/lang-smith-options) | 否   | 不启用             | 无           | 启用 LangSmith tracing。             |

`baseURL` 和 `model` 去除首尾空白后不能为空；`style` 会去除首尾空白，空白值等同于省略。`temperature` 必须
大于或等于 `0`；`maxTokens` 与 `timeoutMs` 必须是正整数；`maxRetries` 必须是非负整数。
`headers` 会按标准 `HeadersInit` 解析并规范化。所有配置在创建 Provider 时一次性校验；任一字段
无效都会在模型请求发出前报告具体字段，不会等到 Dev 或 Build 的首个翻译批次才失败。

Provider 不主动读取宿主的 `OPENAI_API_KEY`。密钥必须显式传入；省略时使用本地服务占位值，
避免意外把宿主环境变量发送到其他地址。

## 日志

OpenAI Provider 不提供第二套日志开关。经过 Vite 调用时，只由 `provider.logging` 决定是否记录及
写入目录；默认关闭，`true` 使用 Vite root 下的 `logs/`，字符串可指定相对或绝对目录。

启用后，一个 `openAI()` translator 实例在对应目录使用一个日志文件。同一实例处理多个批次时持续
追加；新建实例会生成带本地日期时间、PID 和序号的新文件。Vite 触发的 BATCH SCHEDULED、REQUEST、RESPONSE、
VALIDATION、STATE APPLIED、PERSISTED 或 BATCH FAILED 块带有同一 `batchId`；并发批次使用各自的
ID。日志完整记录最终发送的 messages，以及每个响应 choice 的 reasoning、assistant content 和
message 扩展字段；同时保留模型、请求 ID、状态、耗时、usage、Provider 校验结果与错误。未设置
请求参数、SDK runtime 字段和常规传输 Header 会被过滤。日志写入失败只警告一次，不改变翻译或
Build 的结果。

日志包含发送给模型的文案和模型输出，应将 `logs/`、`*.log` 或自定义目录加入 `.gitignore`。
显式 API key 由 Provider 脱敏，常见认证 Header 由 OpenAI SDK 脱敏。日志不等同于逐字节 HTTP
抓包，也无法记录服务或 SDK 没有暴露的内部响应正文。

完整阅读与排障方法见 [LLM 日志与排障](/guide/advanced/llm-logs)。

## style

`style` 只描述团队希望调整的翻译风格。Provider 固定维护专业翻译职责、目标语言、`source` /
`comment` 输入约定、不可改内容、占位符规则、输入输出行对应关系和 JSON 输出约束。`style` 不能替换
这些规则；旧的 `systemPrompt` 已移除，传入时会在模型请求前报错。

推荐说明：

- 产品领域和目标读者；
- UI 文案的语气、长度与大小写习惯；
- 必须保留的品牌名、代码、URL 和占位符；
- 固定术语及其目标语言写法；
- 如何利用 `comment` 消除歧义。

不要在 `style` 中重复定义返回 JSON 的字段、数组长度或占位符协议。完整示例见
[AI 翻译](/guide/advanced/ai-translation#编写翻译风格)。
