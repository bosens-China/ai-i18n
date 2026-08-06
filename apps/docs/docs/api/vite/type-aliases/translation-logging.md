---
title: TranslationLogging
description: Translator 批次接收的日志关闭状态或已解析目录
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationLogging } from '@ai-i18n/vite';
```

## 定义

```ts
type TranslationLogging = false | string;
```

Vite 会把用户配置的 `provider.logging` 规范化后传给 Translator：关闭时为 `false`，开启时为基于
Vite root 解析后的绝对目录。自定义 Translator 可以忽略该诊断字段；它不参与消息身份、缓存键或
Translation Memory。实现了 `reportBatchEvent` 时，无论此值是否为 `false`，都会收到生命周期事件。
