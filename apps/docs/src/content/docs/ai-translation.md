---
title: AI 翻译
description: 配置 OpenAI-compatible Provider，并编写稳定、可维护的翻译提示词
---

AI 翻译是可选能力。未配置 `translator` 时，ai-i18n 仍会完成提取、Runtime 和协议文件维护，
目标语言的缺失值保持为 `null`。

## 安装 Provider

```sh
pnpm add @ai-i18n/openai
```

`@ai-i18n/openai` 连接 OpenAI-compatible API。它不会替你选择供应商或模型。

## 必填与可选配置

`openAI()` 只有两个必填字段：

| 字段           | 是否必填 | 默认值         | 建议                                            |
| -------------- | -------- | -------------- | ----------------------------------------------- |
| `baseURL`      | 是       | 无             | 明确写到供应商的 OpenAI-compatible `/v1` 地址。 |
| `model`        | 是       | 无             | 通过环境变量选择，避免在多个配置文件中重复。    |
| `apiKey`       | 否       | 本地占位值     | 远程服务通常需要；本地无认证服务可省略。        |
| `systemPrompt` | 否       | 内置翻译提示词 | 产品有固定术语、语气或长度限制时建议编写。      |
| `temperature`  | 否       | `1`            | 先使用默认值；需要更稳定的措辞时再降低。        |
| `maxTokens`    | 否       | 由模型决定     | 只有供应商限制或批次响应截断时再设置。          |
| `timeoutMs`    | 否       | `120_000`      | 网络较慢或本地模型较慢时调整。                  |
| `maxRetries`   | 否       | `3`            | 遇到限流时结合供应商策略调整。                  |
| `headers`      | 否       | 无             | 仅用于供应商要求的额外 Header。                 |
| `langSmith`    | 否       | 不启用         | 需要 tracing 时才配置。                         |

完整类型与约束见 [`@ai-i18n/openai` API](../api/openai/)。

## 推荐配置

Vite 配置在 Node 进程中执行。下面使用 `loadEnv()` 读取不带 `VITE_` 前缀的服务端变量，
避免把密钥暴露给浏览器代码：

```ts
// vite.config.ts
import { openAI } from '@ai-i18n/openai';
import { aiI18n } from '@ai-i18n/vite';
import { defineConfig, loadEnv } from 'vite';

function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'AI_');

  return {
    plugins: [
      aiI18n({
        sourceLang: 'zh-CN',
        locales: [
          { value: 'zh-CN', label: '中文' },
          { value: 'en-US', label: 'English' },
        ],
        translator: openAI({
          baseURL: required(env.AI_BASE_URL, 'AI_BASE_URL'),
          model: required(env.AI_MODEL, 'AI_MODEL'),
          apiKey: env.AI_API_KEY,
          systemPrompt: `
你负责翻译面向开发者的 Web 产品界面。
- 使用自然、简洁的目标语言，按钮优先使用动词。
- ai-i18n、Vite、Vue、React 等产品名保持不变。
- 保留代码、URL、变量名和占位符的原始写法。
- 结合 comment 判断文案语境；没有 comment 时采用最常见的 UI 含义。
- 术语约定：构建 = build，工作区 = workspace，按需导入 = auto import。
          `.trim(),
        }),
      }),
    ],
  };
});
```

`.env.local` 示例：

```dotenv
AI_BASE_URL=https://example.com/v1
AI_MODEL=model-name
AI_API_KEY=replace-me
```

不要给密钥添加 `VITE_` 前缀，也不要在客户端源码中导入 Provider。

## 如何编写 `systemPrompt`

推荐把提示词写成短规则，而不是长篇角色设定。每条规则只约束一件事。

### 建议包含

1. **产品与读者**：说明是开发者工具、消费应用还是后台系统。
2. **语气与长度**：例如“按钮使用动词”“错误信息说明原因和处理方式”。
3. **固定术语**：列出团队已经确认的术语映射。
4. **保留内容**：品牌名、代码、URL、变量名和占位符不翻译。
5. **消歧方式**：要求优先使用请求中的 `comment`。

### 不需要包含

- JSON 字段、Schema 或返回示例；Provider 会固定追加结构化输出约束。
- API key、内部地址或其他秘密。
- 与翻译无关的通用模型行为说明。
- 每次都会变化的业务上下文；这类信息更适合放在 `t(source, comment)` 的 `comment` 中。

建议把提示词保存在 Vite 配置可导入的独立常量中，并纳入代码评审。术语发生变化时只修改一处。

## 调度策略

Vite 侧默认行为：

- Dev 防抖 `100` ms；
- 每批序列化请求长度上限 `12_000`；
- 最多并发 `5` 个批次；
- Dev 不阻塞首次模块响应；
- Build 在结束前等待必要批次。

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translator,
  provider: {
    debounceMs: 100,
    batchLength: 12_000,
    maxConcurrency: 5,
    strict: false,
  },
});
```

`batchLength` 统计字符长度，不是 token 数。CI 希望缺失翻译直接失败时，可将
`strict` 设为 `true`。

## 自定义 Translator

也可以实现 `@ai-i18n/core` 的 `Translator`，自行对接其他翻译后端。返回值必须覆盖每个
`messageId + locale`。无法可靠翻译时返回 `null`，不要用源文案伪装成已完成翻译。
