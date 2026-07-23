---
title: 配置与 API
description: aiI18n 配置项与 virtual:ai-i18n Runtime API
---

## `aiI18n()` 配置

| 选项          | 类型                              | 说明                                                          |
| ------------- | --------------------------------- | ------------------------------------------------------------- |
| `sourceLang`  | `string`                          | **必填**。源语言，必须出现在 `locales` 中。                   |
| `locales`     | `LangOption[]`                    | **必填**。`{ value, label }` 列表，`value` 必须唯一。         |
| `defaultLang` | `string`                          | 运行时默认语言。省略时等于 `sourceLang`。                     |
| `framework`   | `'vanilla' \| 'vue' \| 'react'`   | 强制覆盖插件推断。                                            |
| `autoImport`  | `boolean`                         | 强制开启或关闭按需导入。                                      |
| `dts`         | `string \| false`                 | 类型声明输出路径；`false` 表示关闭。默认 `src/ai-i18n.d.ts`。 |
| `directory`   | `string`                          | 协议目录，默认 `i18n`。                                       |
| `translator`  | `Translator`                      | 可选 Provider。未配置则不会自动翻译。                         |
| `provider`    | `object`                          | Dev 调度参数，见下表。                                        |
| `html`        | `boolean \| HtmlExtractorOptions` | HTML 提取开关，或属性白名单。                                 |
| `cleanup`     | `object`                          | 清理策略：`missingSourceFiles`、`orphanMessages`。            |

### `provider` 调度

| 字段             | 默认     | 说明                                                      |
| ---------------- | -------- | --------------------------------------------------------- |
| `debounceMs`     | `100`    | Dev 防抖间隔（毫秒）。                                    |
| `batchLength`    | `12,000` | 按序列化请求长度成批。                                    |
| `maxConcurrency` | `5`      | 最大并发请求数。                                          |
| `strict`         | `false`  | 为 `true` 时，翻译失败或仍为 `null` 会在 `flush` 时抛错。 |

Dev 中 Provider 调用不会阻塞首次模块响应。Build 会在结束前等待必要批次。

## Runtime：`virtual:ai-i18n`

所有框架共用同一虚拟模块：

```ts
import {
  t,
  setLang,
  getLang,
  getLangs,
  subscribe,
  useI18n, // 仅 vue / react 模式导出
} from 'virtual:ai-i18n';
```

| API                   | 说明                                                                    |
| --------------------- | ----------------------------------------------------------------------- |
| `t(source, comment?)` | 翻译。参数必须可静态求值为字符串。                                      |
| `setLang(value)`      | 切换语言，返回 `Promise<void>`。                                        |
| `getLang()`           | 返回当前语言。                                                          |
| `getLangs()`          | 返回配置的语言列表。                                                    |
| `subscribe(listener)` | 订阅语言变化，返回取消函数。                                            |
| `useI18n()`           | Vue/React Hook。提供响应式的 `t`、`setLang`、`currentLang` 和 `langs`。 |

## 提取语义

- 只识别约定 Runtime 或框架 Hook binding 的显式 `t()`。
- Hook binding 支持解构 alias，也支持 `const i18n = useI18n(); i18n.t()`。
- `t('source', undefined)` 等同于省略 comment。
- message ID 由规范化后的 `source` 与可选 `comment` 决定，不包含文件路径。
- 缺失翻译存为 `null`，Runtime 回退到源语言。

## TypeScript

Vite 可直接导入 TypeScript 配置文件。插件通过 tsdown 发布为标准 ESM 与类型声明，
不要求宿主在 Node 中执行包内 TypeScript 源码。
