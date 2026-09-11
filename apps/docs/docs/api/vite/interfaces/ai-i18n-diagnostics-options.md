---
title: AiI18nDiagnosticsOptions
description: 配置默认关闭的慢阶段日志与性能报告
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nDiagnosticsOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nDiagnosticsOptions {
  timing?: boolean | AiI18nTimingDiagnosticsOptions;
  performance?: boolean | AiI18nPerformanceDiagnosticsOptions;
}
```

## 字段

| 字段          | 默认值  | 作用                                                                            |
| ------------- | ------- | ------------------------------------------------------------------------------- |
| `timing`      | `false` | 输出达到阈值的 Vite Dev 阶段耗时。                                              |
| `performance` | `false` | 在 Dev / Build 采集启动与转换阶段，输出本地有界报告与终端汇总；不单独统计写入。 |

`timing: true` 使用 50ms 默认阈值；需要调整阈值时传入
[`AiI18nTimingDiagnosticsOptions`](/api/vite/interfaces/ai-i18n-timing-diagnostics-options)。
`timing` 只写入 Dev 终端，不写项目文件，也不在 Build 中输出。

`performance: true` 使用默认报告目录和样本上限，也可传入
[`AiI18nPerformanceDiagnosticsOptions`](/api/vite/interfaces/ai-i18n-performance-diagnostics-options)。
两种诊断独立开启，性能报告的统计不受慢日志阈值过滤。详见[性能诊断](/guide/advanced/performance)。
