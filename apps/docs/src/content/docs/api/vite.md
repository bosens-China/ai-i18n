---
title: Vite 插件配置
description: aiI18n() 的全部配置项、嵌套字段、默认值与约束
---

## `aiI18n(options)`

```ts
import { aiI18n } from '@boses/vite';

aiI18n({
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
});
```

`aiI18n()` 返回一个 Vite 插件。每个 Vite build 只应注册一次。

### 顶层选项

| 选项          | 类型                              | 必填 | 默认值               | 作用                                            |
| ------------- | --------------------------------- | ---- | -------------------- | ----------------------------------------------- |
| `sourceLang`  | `string`                          | 是   | 无                   | 源语言，必须是 `locales` 中的 `value`。         |
| `locales`     | `readonly LangOption[]`           | 是   | 无                   | 支持的语言列表；不能为空，且 `value` 必须唯一。 |
| `defaultLang` | `string`                          | 否   | `sourceLang`         | 浏览器 Runtime 首次加载时使用的语言。           |
| `framework`   | `'vanilla' \| 'vue' \| 'react'`   | 否   | 自动检测             | 覆盖框架推断结果。                              |
| `autoImport`  | `boolean`                         | 否   | 自动检测             | 强制开启或关闭 ai-i18n 的按需导入。             |
| `dts`         | `string \| false`                 | 否   | `'src/ai-i18n.d.ts'` | 修改声明文件路径；`false` 表示不生成。          |
| `directory`   | `string`                          | 否   | `'i18n'`             | 协议目录，相对于 Vite `root`。                  |
| `translator`  | `Translator`                      | 否   | 不调用模型           | 自动翻译函数。                                  |
| `provider`    | `AiI18nProviderOptions`           | 否   | 见下表               | 调整翻译批次、并发与失败策略。                  |
| `html`        | `boolean \| HtmlExtractorOptions` | 否   | `false`              | 开启 `index.html` 文本与属性提取。              |
| `cleanup`     | `object`                          | 否   | 见下表               | 控制失效文件和孤立消息的清理。                  |

### `LangOption`

| 字段    | 类型     | 必填 | 默认值 | 作用                                           |
| ------- | -------- | ---- | ------ | ---------------------------------------------- |
| `value` | `string` | 是   | 无     | 语言标识；传给 `setLang()`，也用于输出文件名。 |
| `label` | `string` | 是   | 无     | 面向用户的语言名称；由 `getLangs()` 返回。     |

`locales` 至少包含一项。`sourceLang` 与 `defaultLang` 都必须匹配某个 `value`。

## 框架与自动导入

### `framework`

省略 `framework` 时，插件读取 Vite 最终插件列表：

| 检测结果                          | 模式      |
| --------------------------------- | --------- |
| 存在 `vite:vue` 或 `vite:vue-jsx` | `vue`     |
| 存在 `vite:react*`                | `react`   |
| 都不存在                          | `vanilla` |

同一个 build 同时出现 Vue 与 React Vite 插件时会报错。显式设置 `framework`
不会绕过这项限制。

### `autoImport`

省略 `autoImport` 时，仅当最终插件列表中存在 `unplugin-auto-import` 或它的命名扩展时，
ai-i18n 才启用按需导入。显式设置 `true` 或 `false` 的优先级更高。

外部 Auto Import 插件只是自动启用信号。真正的
`virtual:ai-i18n` import 由 ai-i18n 注入，不要把同一组 API 重复写进外部插件的
`imports`。

| 模式      | 可按需导入的全局 API                               |
| --------- | -------------------------------------------------- |
| `vanilla` | `t`、`setLang`、`getLang`、`getLangs`、`subscribe` |
| `vue`     | `useI18n`                                          |
| `react`   | `useI18n`                                          |

## Provider 调度

`provider` 只有在传入 `translator` 后才生效。

| 字段             | 类型      | 必填 | 默认值   | 作用                                                      |
| ---------------- | --------- | ---- | -------- | --------------------------------------------------------- |
| `debounceMs`     | `number`  | 否   | `100`    | Dev 中合并连续缺失请求的等待时间，单位为毫秒。            |
| `batchLength`    | `number`  | 否   | `12_000` | 每批序列化请求的字符长度上限，不是 token 数。             |
| `maxConcurrency` | `number`  | 否   | `5`      | 同时执行的翻译批次数。                                    |
| `strict`         | `boolean` | 否   | `false`  | 为 `true` 时，翻译失败或仍有 `null` 会在 `flush` 时抛错。 |

Dev 中的模型调用不会阻塞首次模块响应。Build 会在结束前等待必要批次。

## HTML 提取

| 写法                   | 行为                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `html: false` 或省略   | 不处理 HTML。                                                     |
| `html: true`           | 提取文本，以及 `alt`、`aria-label`、`placeholder`、`title` 属性。 |
| `html: { attributes }` | 用传入数组替换默认属性白名单。                                    |

`attributes` 的类型为 `readonly string[]`，可选。HTML 提取与框架模式相互独立。

## 清理策略

| 字段                 | 类型      | 必填 | 默认值  | 作用                                          |
| -------------------- | --------- | ---- | ------- | --------------------------------------------- |
| `missingSourceFiles` | `boolean` | 否   | `true`  | 源文件已不存在时，删除对应 `extracted` 文件。 |
| `orphanMessages`     | `boolean` | 否   | `false` | 清理当前源码不再引用的消息。                  |

建议保留默认值。`cache.json` 还承担 Translation Memory 的职责，激进清理会降低文件移动、
恢复或分支合并后的翻译复用率。

## 声明文件

默认生成的 `src/ai-i18n.d.ts` 同时声明虚拟模块和当前模式下的全局 API。该文件由插件维护，
带有 `@noformat`、`@ts-nocheck` 与 `eslint-disable` 标记，请勿手工编辑。

只有在宿主项目用其他方式维护等价声明时，才建议设置 `dts: false`。
