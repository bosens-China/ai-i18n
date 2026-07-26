# @ai-i18n/openai

基于 LangChain `ChatOpenAI` 的 OpenAI-compatible ai-i18n Provider。供应商、地址和模型必须
显式配置；API key 可省略以连接本地服务。

alpha 阶段请安装 `@ai-i18n/openai@alpha`。

```ts
import { openAI } from '@ai-i18n/openai';

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
});
```

`temperature`、`timeoutMs`、`maxRetries` 默认分别为 `1`、`120_000`、`3`；`maxTokens`
不设置时交给模型决定。Provider 使用 OpenAI-compatible JSON mode，并在用户提示词尾部固定
追加纯 JSON 约束和最小示例，然后按内部 Schema、输入下标和目标语言严格校验结果。传入
`langSmith` 即启用 tracing，不传则不会创建 LangSmith client。
`temperature` 会原样传给兼容服务，是否实际生效由服务、模型及其运行模式决定。

Vite 先按“缺失目标 locale 集合”分组，再把每组作为一个 Translator 批次。`openAI()`
对收到的每批只调用模型一次；已有英文的旧消息只会进入“缺日文”组，不会重复生成英文。
模型收到的用户输入类似 `[{"source":"查询"},{"source":"查询","comment":"按钮"}]`。
`comment` 只用于理解语境，不进入译文；正文中的 `#` 保持正文含义。返回结构类似
`{"translations":[{"en-US":"Search","ja-JP":"検索"}, ...]}`，数组下标与输入行一致。
`messageId`、文件路径和源码位置都不会发送给模型；Vite 按输入下标与 locale 写回内部
消息。

`` t`...${value}` `` 产生的 `{{0}}` 等运行时占位符，以及表示字面文本的 `{{=0}}`、
`{{==0}}` 等转义标记都会追加到系统约束；译文可调整其顺序，但增删、重复或在两类标记间
互换都会被拒绝。

Vite 调度层默认按 `JSON.stringify({ locales, messages }).length` 达到 `12_000` 时成批，
并把并发请求限制为 `5`；单条超限文案独立成批。
