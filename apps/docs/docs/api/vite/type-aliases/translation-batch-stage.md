---
title: TranslationBatchStage
description: Translator 批次诊断阶段
---

从 `@ai-i18n/vite` 导入：

```ts
import type { TranslationBatchStage } from '@ai-i18n/vite';
```

## 定义

```ts
type TranslationBatchStage =
  'scheduled' | 'state-applied' | 'persisted' | 'failed';
```

各阶段含义见 [`TranslationBatchEvent`](/api/vite/interfaces/translation-batch-event)。
