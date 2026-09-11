---
title: AiI18nPerformanceDiagnosticsOptions
description: 配置 Dev 与 Build 的本地性能报告
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nPerformanceDiagnosticsOptions } from '@ai-i18n/vite';

interface AiI18nPerformanceDiagnosticsOptions {
  directory?: string;
  maxSamples?: number;
}
```

| 字段         | 默认值               | 作用                                                                           |
| ------------ | -------------------- | ------------------------------------------------------------------------------ |
| `directory`  | `'logs/performance'` | 相对 Vite root 的报告目录，不允许空值、绝对路径、`..` 或位于 i18n 协议目录内。 |
| `maxSamples` | `2000`               | 最近完成明细、进行中明细及每阶段分位数窗口各自的容量上限，整数范围 1–10000。   |

通过 `diagnostics.performance: true` 使用默认值；省略或设为 `false` 时不采集、不创建报告。
累计次数、总耗时、最大耗时与错误数不受明细容量限制。Dev 和 Build 均生效。
目录需要加入 `.gitignore`，旧会话报告由使用者自行清理。

配置示例与结果解读见[性能诊断](/guide/advanced/performance)。
