---
title: 低层库 API
description: '@boses/core、@boses/analyzer 与 @boses/vite 子路径的公开导出'
---

这一页面向需要自定义提取、Runtime 或框架适配器的库作者。普通 Vite 应用只需要
`aiI18n()` 和 `virtual:ai-i18n`。

## `@boses/vite` 子路径

| 入口                   | 导出                         | 参数                                          | 默认值                 | 作用                                  |
| ---------------------- | ---------------------------- | --------------------------------------------- | ---------------------- | ------------------------------------- |
| `@boses/vite`          | `aiI18n(options)`            | `options` 必填                                | 见[插件配置](../vite/) | 注册 Vite 插件。                      |
| `@boses/vite/runtime`  | `createI18nRuntime(options)` | `sourceLang`、`defaultLang`、`locales` 都必填 | 无                     | 创建独立 Runtime。                    |
| `@boses/vite/vue`      | `createVueI18n(runtime)`     | `runtime` 必填                                | 无                     | 把 Runtime 适配为 Vue `useI18n()`。   |
| `@boses/vite/react`    | `createReactI18n(runtime)`   | `runtime` 必填                                | 无                     | 把 Runtime 适配为 React `useI18n()`。 |
| `@boses/vite/client`   | TypeScript 声明              | 无                                            | 无                     | 声明基础版 `virtual:ai-i18n`。        |
| `@boses/vite/analyzer` | `analyzeVueSource()`         | 三个参数都必填                                | 无                     | 兼容入口，转发 Vue SFC 分析器。       |

`@boses/vite` 根入口还导出 `AiI18nOptions`、`AiI18nProviderOptions`、
`AiI18nFramework`、`HtmlExtractorOptions` 和 `I18nRuntime` 类型。

## `@boses/core`

### Message ID

| 导出                                | 参数           | 可选与默认值                 | 作用                          |
| ----------------------------------- | -------------- | ---------------------------- | ----------------------------- |
| `MESSAGE_ID_VERSION`                | 无             | 固定常量                     | 当前 message ID 协议版本。    |
| `createMessageId(source, comment?)` | `source` 必填  | `comment` 可选，默认为无注释 | 根据源文案与注释生成稳定 ID。 |
| `normalizeComment(comment?)`        | `comment` 可选 | 空值归一化为无注释           | 统一注释语义。                |
| `escapeMessageIdPart(value)`        | `value` 必填   | 无默认值                     | 转义 message ID 片段。        |
| `parseMessageId(id)`                | `id` 必填      | 无默认值                     | 解析版本、源文案与注释。      |

### 协议文件

| 导出                                    | 参数               | 可选与默认值 | 作用                                 |
| --------------------------------------- | ------------------ | ------------ | ------------------------------------ |
| `parseCacheFile(value)`                 | `value` 必填       | 无默认值     | 校验并解析 `cache.json`。            |
| `parseExtractedFile(value)`             | `value` 必填       | 无默认值     | 校验并解析 `extracted/*.json`。      |
| `parseLocaleFile(value)`                | `value` 必填       | 无默认值     | 校验并解析 `locales/*.json`。        |
| `mergeCacheMessages(current, incoming)` | 两个消息映射都必填 | 无默认值     | 合并缓存消息并检测翻译冲突。         |
| `AiI18nSchemaError`                     | 错误类             | 无           | 表示协议文件结构错误。               |
| `TranslationConflictError`              | 错误类             | 无           | 表示同一消息和语言出现不同非空翻译。 |

相关类型：`CacheFileV1`、`CacheMessage`、`ExtractedFileV1`、`ExtractedMessage`、
`LocaleFileV1`、`LangOption` 与 `TranslationValue`。

### Runtime 与 Provider

| 导出                         | 参数                                          | 可选与默认值 | 作用                                     |
| ---------------------------- | --------------------------------------------- | ------------ | ---------------------------------------- |
| `createI18nRuntime(options)` | `sourceLang`、`defaultLang`、`locales` 都必填 | 无默认值     | 创建内存 Runtime。                       |
| `I18nRuntime`                | 类型                                          | 无           | 描述翻译、语言切换、订阅与模块注册接口。 |
| `Translator`                 | 函数类型                                      | 无           | 描述批量翻译函数。                       |

同时导出 `I18nRuntimeOptions`、`ModuleMessages`、`TranslationRequest` 和
`TranslationResult` 类型。

## `@boses/analyzer`

### JavaScript 与 TypeScript

| 导出                                                                               | 必填参数       | 可选参数与默认值                                                           | 作用                                      |
| ---------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| `analyzeModule(code, id, analyzer?, lang?)`                                        | `code`、`id`   | `analyzer` 与 `lang` 均可选                                                | 解析一个 JS、TS、JSX 或 TSX 模块。        |
| `extractMessages(module, runtimeModuleId?, translationHooks?, autoImportRuntime?)` | `module`       | Runtime ID 默认为 `virtual:ai-i18n`；Hook 默认为空；按需导入默认为 `false` | 提取静态消息、警告与 pending 状态。       |
| `findUnboundCalls(module, names)`                                                  | 两个参数都必填 | 无默认值                                                                   | 查找指定名称中没有本地 binding 的调用。   |
| `Analyzer`                                                                         | 类             | 由 `yuku-analyzer` 提供                                                    | 跨文件维护解析与 import resolution 状态。 |
| `AI_I18N_VIRTUAL_MODULE_ID`                                                        | 常量           | `'virtual:ai-i18n'`                                                        | 默认 Runtime 模块 ID。                    |

类型导出：`Module`、`AnalysisLanguage`、`TranslationHookBinding`、`SourceLocation`、
`ExtractedMessage`、`ExtractWarningCode`、`ExtractWarning` 与 `ExtractResult`。

### Vue SFC

从 `@boses/analyzer/vue` 导入：

```ts
import { analyzeVueSource } from '@boses/analyzer/vue';
```

`analyzeVueSource(source, id, compiler)` 的三个参数都必填。它使用宿主提供的
`@vue/compiler-sfc` 解析 SFC，并返回用于共享分析器的代码、语言、位置映射和注册插入点。

类型导出：`VueCompiler`、`VueRegistrationInsertion` 与 `VueAnalysisSource`。

## 其他命名导出

| 包                     | 导出                                   | 参数                  | 作用                                     |
| ---------------------- | -------------------------------------- | --------------------- | ---------------------------------------- |
| `@boses/eslint-plugin` | `tStaticArgs`                          | ESLint 按规则协议调用 | 允许在自定义插件组合中直接复用规则对象。 |
| `@boses/mcp`           | `createAiI18nMcpServer(workspaceRoot)` | `workspaceRoot` 必填  | 创建可嵌入 Node 进程的 MCP server。      |

`@boses/mcp` 还导出三个工具的输入、条目与写入结果类型，字段见
[MCP 工具](../mcp/)。
