---
title: LangSmithOptions
description: 配置 OpenAI Provider 的 LangSmith tracing
---

从 `@ai-i18n/openai` 导入：

```ts
import type { LangSmithOptions } from '@ai-i18n/openai';
```

## 定义

```ts
interface LangSmithOptions {
  apiKey: string;
  project?: string;
  endpoint?: string;
  workspaceId?: string;
}
```

## 字段

| 字段          | 类型     | 必填 | 默认值             | 作用                |
| ------------- | -------- | ---- | ------------------ | ------------------- |
| `apiKey`      | `string` | 是   | 无                 | LangSmith API key。 |
| `project`     | `string` | 否   | LangSmith 默认项目 | 写入的项目名。      |
| `endpoint`    | `string` | 否   | LangSmith 默认地址 | 自托管或代理地址。  |
| `workspaceId` | `string` | 否   | 无                 | 目标 workspace。    |

只有传入 `OpenAIOptions.langSmith` 时，Provider 才会创建 tracing callback。

```ts
openAI({
  baseURL,
  model,
  langSmith: {
    apiKey: process.env.LANGSMITH_API_KEY!,
    project: 'ai-i18n',
  },
});
```
