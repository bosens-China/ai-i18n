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

值必须是大于或等于 0 的有限数字。输出包含三个总阶段：

- `source-transform`：单个源码模块的完整转换。
- `file-sync`：一批 Dev 变化的后台协议持久化。
- `registration-load`：虚拟注册模块的生成与加载。

为进一步定位瓶颈，还会输出 `plugin-ready-wait`、`source-analysis`、
`source-registration`、`dependency-resolution`、`state-transaction`、`snapshot-build`、
`extracted-scan`、`translation-memory-sync`、`extracted-write` 和 `locale-write` 子阶段。
总阶段与子阶段可能互相包含，不能把日志中的所有耗时直接相加。

`dependency-resolution` 会调用 Vite 的模块解析，并在依赖尚未分析时等待 Vite 加载该模块，因此可能
包含子模块的嵌套转换。它不是纯粹的插件解析 CPU；判断是否阻塞页面时，应结合浏览器可见时间和子模块
日志确认关键路径，不能只凭一条较慢日志归因。

每条日志携带相对 Vite root 的规范化模块 ID，不包含源码正文、译文、凭据或机器绝对路径。
