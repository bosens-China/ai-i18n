---
title: AiI18nDiagnosticsOptions
description: 配置构建文案汇总、慢阶段日志与性能报告
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nDiagnosticsOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nDiagnosticsOptions {
  buildSummary?: boolean;
  timing?: boolean | AiI18nTimingDiagnosticsOptions;
  performance?: boolean | AiI18nPerformanceDiagnosticsOptions;
}
```

## 字段

| 字段           | 默认值  | 作用                                                                            |
| -------------- | ------- | ------------------------------------------------------------------------------- |
| `buildSummary` | `true`  | 成功构建后汇总文案总数与各语言的已翻译、未翻译数量。                            |
| `timing`       | `false` | 输出达到阈值的 Vite Dev 阶段耗时。                                              |
| `performance`  | `false` | 在 Dev / Build 采集启动与转换阶段，输出本地有界报告与终端汇总；不单独统计写入。 |

`timing: true` 使用 50ms 默认阈值；需要调整阈值时传入
[`AiI18nTimingDiagnosticsOptions`](/api/vite/interfaces/ai-i18n-timing-diagnostics-options)。
`timing` 只写入 Dev 终端，不写项目文件，也不在 Build 中输出。

`performance: true` 使用默认报告目录和样本上限，也可传入
[`AiI18nPerformanceDiagnosticsOptions`](/api/vite/interfaces/ai-i18n-performance-diagnostics-options)。
两种诊断独立开启，性能报告的统计不受慢日志阈值过滤。详见[性能诊断](/guide/advanced/performance)。

## 构建文案汇总

默认在成功 Build 结束后输出一次，等待本轮 Provider 工作与持久化完成；Build Watch 每轮刷新。
未配置 Provider 或 Provider 未能补齐时，仍会如实显示未翻译数量，汇总本身不会触发翻译。

文案按原文与 `comment` 的身份去重，文件数只包含有文案的文件。每个目标语言分别统计，
不计源语言；同一条消息只有在全部使用位置都具备有效译文时才算已翻译。有效译文包含自动
译文与全局、文件、位置级人工覆盖，空字符串也算译文。统计范围是本轮构建收集的模块，
不代表仓库内所有文件；失败构建不输出成功覆盖率。

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  diagnostics: { buildSummary: false },
});
```

开启 `performance` 后，Build 的性能摘要与文案汇总合并输出；阶段耗时仍可能嵌套，不能相加作为
构建总耗时。`buildSummary: false` 不会关闭单独启用的性能报告。汇总遵循 Vite 的日志级别，
提示语言沿用插件的中英文诊断设置。
