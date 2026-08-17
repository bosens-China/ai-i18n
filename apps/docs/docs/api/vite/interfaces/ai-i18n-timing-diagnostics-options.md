---
title: AiI18nTimingDiagnosticsOptions
description: 配置 Vite Dev 慢阶段的输出阈值
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nTimingDiagnosticsOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nTimingDiagnosticsOptions {
  minDurationMs?: number;
}
```

## 字段

| 字段            | 默认值 | 作用                            |
| --------------- | ------ | ------------------------------- |
| `minDurationMs` | `50`   | 只输出耗时达到该值的 Dev 阶段。 |

值必须是大于或等于 0 的有限数字。输出覆盖 `source-transform`、`file-sync` 和
`registration-load`，并携带相对 Vite root 的规范化模块 ID；日志不包含源码正文或译文。
