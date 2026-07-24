---
title: Vite 插件配置
description: aiI18n() 的全部配置项、嵌套字段、默认值与约束
---

## `aiI18n(options)`

```ts
import { aiI18n } from '@ai-i18n/vite';

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
| `loading`     | `AiI18nLocaleLoadingOptions`      | 否   | 全语言注册           | 按 locale 拆分并提示加载目标语言资产。          |
| `framework`   | `'vanilla' \| 'vue' \| 'react'`   | 否   | 自动检测             | 覆盖框架推断结果。                              |
| `autoImport`  | `boolean`                         | 否   | 自动检测             | 强制开启或关闭 ai-i18n 的按需导入。             |
| `dts`         | `string \| false`                 | 否   | `'src/ai-i18n.d.ts'` | 修改声明文件路径；`false` 表示不生成。          |
| `directory`   | `string`                          | 否   | `'i18n'`             | 协议目录，相对于 Vite `root`。                  |
| `translator`  | `Translator`                      | 否   | 不调用模型           | 自动翻译函数。                                  |
| `provider`    | `AiI18nProviderOptions`           | 否   | 见下表               | 调整翻译批次、并发与失败策略。                  |
| `html`        | `boolean \| HtmlExtractorOptions` | 否   | `false`              | 开启 `index.html` 文本与属性提取。              |
| `cache`       | `AiI18nCacheOptions`              | 否   | 不限制               | 限制历史 Translation Memory 的规模。            |
| `cleanup`     | `object`                          | 否   | 见下表               | 控制失效文件和孤立消息的清理。                  |

### `LangOption`

| 字段    | 类型     | 必填 | 默认值 | 作用                                           |
| ------- | -------- | ---- | ------ | ---------------------------------------------- |
| `value` | `string` | 是   | 无     | 语言标识；传给 `setLang()`，也用于输出文件名。 |
| `label` | `string` | 是   | 无     | 面向用户的语言名称；由 `getLangs()` 返回。     |

`locales` 至少包含一项。`sourceLang` 与 `defaultLang` 都必须匹配某个 `value`。

## 按语言加载

```ts
aiI18n({
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語' },
  ],
  loading: {
    strategy: 'locale',
    preload: ['en-US'],
    prefetch: ['ja-JP'],
  },
});
```

| 字段       | 类型                | 必填 | 默认值 | 作用                                     |
| ---------- | ------------------- | ---- | ------ | ---------------------------------------- |
| `strategy` | `'locale'`          | 是   | 无     | 为每个目标 locale 生成独立 Vite chunk。  |
| `preload`  | `readonly string[]` | 否   | `[]`   | 通过 `modulepreload` 尽早准备语言模块。  |
| `prefetch` | `readonly string[]` | 否   | `[]`   | 通过 `prefetch` 低优先级提示浏览器缓存。 |

列表只能引用已配置的目标 locale。source locale 不能进入任一列表。同一 locale 同时出现在
两个列表中会报错；单个列表内的重复项会去重。

非 source 的 `defaultLang` 自动采用 preload 语义。页面先使用同步 source fallback，目标语言
加载完成后再切换并通知订阅者。未配置提示的目标语言在首次 `setLang()` 时加载。相同 locale
的并发加载共享一个 Promise；不同 locale 的并发切换以最后一次调用为准。加载失败时保持
当前语言。

`modulepreload` 和 `prefetch` 都是浏览器调度提示。浏览器可以调整优先级，插件不会把
prefetch 完成作为切换语言的前置条件。省略 `loading` 时继续使用全语言注册模式。

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

## Build Watch

普通 `vite build` 每次使用新的 ProjectState。`vite build --watch` 首轮创建状态，后续重建
复用 analyzer、resolution 和 reverse dependents：

- source 变化只重新 parse 当前文件，并刷新必要的依赖方；
- extracted 或目标 locale 文件变化只合并翻译和 registration，不重新 parse source；
- source 删除、重命名或 import 被移除后，当前活动模块图会重新校准；
- 已有 Translation Memory 不会重复请求 Provider；
- 协议内容没有变化时，不改写对应 JSON 文件。

Vite 配置文件及其依赖、ai-i18n 插件实现、extractor 或 schema 变化后，需要重启
`vite build --watch`。插件不会在 Watch 进程内模拟配置热重载。

## Cache 容量

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  cache: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
});
```

| 字段          | 类型     | 必填 | 默认值 | 作用                                                    |
| ------------- | -------- | ---- | ------ | ------------------------------------------------------- |
| `maxMessages` | `number` | 否   | 不限制 | `cache.messages` 允许保留的最大条数。                   |
| `maxBytes`    | `number` | 否   | 不限制 | 稳定序列化后整个 `cache.json` 允许占用的 UTF-8 字节数。 |

两个字段必须是正整数。省略两项时不启用容量淘汰；同时配置时，输出需要同时满足两个限制。
插件先合并磁盘编辑并执行 missing source 清理，再按 message ID 稳定淘汰当前源码不再引用的
Translation Memory。

cache file records 或当前 ProjectState 引用的 message 属于活动数据，不会参与容量淘汰。
如果活动数据自身已经超过限制，插件会保留它们并输出 warning，因此容量限制是保护数据安全的
软上限。

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
恢复或分支合并后的翻译复用率。`orphanMessages: true` 会先删除全部非活跃消息，优先级高于
Cache 容量限制。

## 声明文件

默认生成的 `src/ai-i18n.d.ts` 同时声明虚拟模块和当前模式下的全局 API。该文件由插件维护，
带有 `@noformat`、`@ts-nocheck` 与 `eslint-disable` 标记，请勿手工编辑。

只有在宿主项目用其他方式维护等价声明时，才建议设置 `dts: false`。
