# @ai-i18n/openai

基于 LangChain `ChatOpenAI` 的 OpenAI-compatible ai-i18n Provider。供应商、地址和模型必须
显式配置；API key 可省略以连接本地服务。

alpha 阶段请安装 `@ai-i18n/openai@alpha`。

```ts
import { openAI } from '@ai-i18n/openai';
import { aiI18n } from '@ai-i18n/vite';

const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

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

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  provider: {
    translator,
    logging: true,
  },
});
```

`temperature`、`timeoutMs`、`maxRetries` 默认分别为 `1`、`120_000`、`3`；`maxTokens`
不设置时交给模型决定。Provider 使用 OpenAI-compatible JSON mode，并在用户提示词尾部固定
追加纯 JSON 约束和最小示例。目标语言与批次长度生成的 Zod Schema 同时提供给 LangChain
structured output 并校验实际响应，顶层字段、输入下标、目标语言和值类型必须精确匹配；占位符
一致性随后按 source 与译文单独校验。配置、目标语言与消息结构也会在请求前通过 Zod 校验。传入
`langSmith` 即启用 tracing，不传则不会创建 LangSmith client。
`temperature` 会原样传给兼容服务，是否实际生效由服务、模型及其运行模式决定。

LLM 调试日志默认关闭，并且只通过 Vite 的 `provider.logging` 配置。设置为 `true` 时写入 Vite
root 下的 `logs/`；设置为字符串时选择目录，相对路径基于 Vite root，绝对路径保持不变。每次创建
`openAI()` translator 时会在首次写入时分配一个新的
`日期-时间-pPID-序号.log` 文件；同一实例在 Dev/HMR 或 Build Watch 中重复调用时持续追加到
该文件。日志把 OpenAI SDK debug 事件整理为便于人工审查的多行文本：完整记录最终发送的
system、user 等 messages，以及每个响应 choice 的思考、回复和 message 扩展字段；同时保留
模型、请求 ID、耗时、finish reason、usage、Provider 校验结果和错误。未设置参数、SDK runtime
字段和常规传输 Header 不会写入。

Vite 应用省略或设置 `provider.logging: false` 时，不会创建或追加当前 Dev/Build 进程的批次日志，
也不会创建默认目录，但不会停止翻译、提取、缓存或持久化。空目录字符串是配置错误。

由 Vite 调度时，BATCH SCHEDULED、REQUEST、RESPONSE、VALIDATION、STATE APPLIED、PERSISTED
或 BATCH FAILED 块通过同一 `batchId` 串起。并发调用使用独立异步上下文，不会把 SDK 响应和校验
结果记到其他批次。直接调用 `openAI()` 返回的 Translator 且不传 `batchId` 时，Provider 会生成
本地诊断 ID。

日志可能包含待翻译文案和模型输出，应把日志目录加入 `.gitignore`，例如 `logs/` 和 `*.log`。
Provider 会脱敏显式 API key，SDK 会脱敏常见认证 Header；日志不承诺保留逐字节 HTTP 原文，
也不保证第三方服务或 SDK 未暴露的内部重试响应正文。日志写入失败只输出一次警告，不会中止翻译
或宿主 Build。

Vite 先按“缺失目标 locale 集合”分组，再把每组作为一个 Translator 批次。`openAI()`
对收到的每批只调用模型一次；已有英文缓存译文的消息只会进入“缺日文”组，不会重复生成英文。
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
