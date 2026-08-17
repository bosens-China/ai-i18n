---
title: AiI18nDiagnosticsOptions
description: 配置默认关闭的 Vite Dev 诊断
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nDiagnosticsOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nDiagnosticsOptions {
  timing?: boolean | AiI18nTimingDiagnosticsOptions;
}
```

## 字段

| 字段     | 默认值  | 作用                               |
| -------- | ------- | ---------------------------------- |
| `timing` | `false` | 输出达到阈值的 Vite Dev 阶段耗时。 |

`timing: true` 使用 50ms 默认阈值；需要调整阈值时传入
[`AiI18nTimingDiagnosticsOptions`](/api/vite/interfaces/ai-i18n-timing-diagnostics-options)。
该诊断只写入 Dev 终端，不写项目文件，也不在 Build 中输出。
