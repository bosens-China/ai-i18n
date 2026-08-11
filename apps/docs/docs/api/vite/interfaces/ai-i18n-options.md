---
title: AiI18nOptions
description: aiI18n() 的顶层配置接口
---

从 `@ai-i18n/vite` 导入：

```ts
import type { AiI18nOptions } from '@ai-i18n/vite';
```

## 定义

```ts
interface AiI18nOptions {
  framework?: AiI18nFramework;
  autoImport?: boolean;
  dts?: string | false;
  sourceLang: string;
  defaultLang?: string;
  locales: readonly LangOption[];
  persist?: boolean | AiI18nPersistOptions;
  loading?: AiI18nLocaleLoadingOptions;
  translationMemory?: AiI18nTranslationMemoryOptions;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: AiI18nCleanupOptions;
  html?: boolean | HtmlExtractorOptions;
  review?: boolean;
}
```

## 字段

| 字段                | 类型                                                                                        | 必填 | 默认值               | 作用                                     |
| ------------------- | ------------------------------------------------------------------------------------------- | ---- | -------------------- | ---------------------------------------- |
| `sourceLang`        | `string`                                                                                    | 是   | 无                   | 源码文案所属语言。                       |
| `locales`           | [`readonly LangOption[]`](/api/vite/interfaces/lang-option)                                 | 是   | 无                   | 项目支持的语言列表。                     |
| `defaultLang`       | `string`                                                                                    | 否   | `sourceLang`         | 没有有效持久化值时使用的初始语言。       |
| `persist`           | `boolean` 或 [`AiI18nPersistOptions`](/api/vite/interfaces/ai-i18n-persist-options)         | 否   | `false`              | 使用 localStorage 保存语言偏好。         |
| `loading`           | [`AiI18nLocaleLoadingOptions`](/api/vite/interfaces/ai-i18n-locale-loading-options)         | 否   | 全语言注册           | 按 locale 拆分语言资产。                 |
| `framework`         | [`AiI18nFramework`](/api/vite/type-aliases/ai-i18n-framework)                               | 否   | 自动检测             | 指定 Vanilla、Vue 或 React 模式。        |
| `autoImport`        | `boolean`                                                                                   | 否   | `false`              | 自动注入当前框架模式的 Runtime API。     |
| `dts`               | `string \| false`                                                                           | 否   | `'src/ai-i18n.d.ts'` | 设置声明文件路径，或关闭生成。           |
| `directory`         | `string`                                                                                    | 否   | `'i18n'`             | 设置协议目录；相对路径基于 Vite `root`。 |
| `provider`          | [`AiI18nProviderOptions`](/api/vite/type-aliases/ai-i18n-provider-options)                  | 否   | 不调用模型           | 配置自动翻译函数、缓存与调度策略。       |
| `html`              | [`boolean \| HtmlExtractorOptions`](/api/vite/interfaces/html-extractor-options)            | 否   | `false`              | 开启 `index.html` 文本和属性提取。       |
| `translationMemory` | [`AiI18nTranslationMemoryOptions`](/api/vite/interfaces/ai-i18n-translation-memory-options) | 否   | 分片 JSON            | 选择存储方式，并按需限制历史译文容量。   |
| `cleanup`           | [`AiI18nCleanupOptions`](/api/vite/interfaces/ai-i18n-cleanup-options)                      | 否   | 保留默认清理策略     | 控制失效提取文件和孤立消息的清理。       |
| `review`            | `boolean`                                                                                   | 否   | `true`               | 在 Vite Dev 中提供翻译校对页面。         |

## 语言约束

`locales` 至少包含一项，且每一项的 `value` 必须唯一。`sourceLang` 与 `defaultLang` 必须匹配
某个 `value`。

目标语言缺译或值为 `null` 时，Runtime 返回 source 文案。插件不会为 `sourceLang` 生成重复的
目标语言文件。

初始语言按以下顺序选择：

1. localStorage 中有效的持久化值；
2. `defaultLang`；
3. 省略 `defaultLang` 时使用 `sourceLang`。

## 框架与自动导入

省略 `framework` 时，插件读取 Vite 最终插件列表：

| 检测结果                          | 模式      |
| --------------------------------- | --------- |
| 存在 `vite:vue` 或 `vite:vue-jsx` | `vue`     |
| 存在 `vite:react*`                | `react`   |
| 都不存在                          | `vanilla` |

同一个 build 同时出现 Vue 与 React 插件时会报错。显式设置 `framework` 不会绕过这项检查。
显式值只能是 `'vanilla'`、`'vue'` 或 `'react'`；JavaScript 配置中的其他值也会在启动时被拒绝。

`autoImport: true` 注入的 API 取决于最终模式。三种模式都有 `t`、`setLang`、`getLang`、
`getLangs`、`getLangLoadState` 与 `subscribe`；Vue 额外注入 `useI18n`、`tRef`、
`i18nComputed`、`tComputed`，React 额外注入 `useI18n`。

完整接入方法见[自动导入](/guide/basic/auto-import)。

## 路径

`directory` 与 `dts` 的相对路径都基于 Vite `root` 解析；传入绝对路径时直接使用该路径。

## 翻译校对

`review` 默认开启。运行 `vite dev` 后，终端会在 Vite 地址之后打印 `ai-i18n Review` 链接；
打开链接即可查看当前 Dev 已访问模块中的文案，并把人工译文保存到 `overrides.json`。保存后当前页面
会通过 HMR 更新。

校对页面只注册在 Vite Dev Server，不进入 Build、Preview 或生产产物。它仅接受同源 JSON 写入，
不提供跨机器访问所需的账号或 token。界面已随插件提供，业务项目不需要为它安装 Vue 或 UI 组件库。
确实不需要时设置 `review: false`。

## 相关内容

- [`aiI18n()`](/api/vite/functions/ai-i18n)
- [翻译校对](/guide/basic/translation-review)
- [语言分包与按需加载](/guide/basic/locale-loading)
- [生成文件与 Git](/guide/basic/directory)
- [TypeScript 与生成声明](/guide/quality/typescript)
- [Translation Memory](/guide/advanced/translation-memory)
- [ESLint](/guide/quality/eslint)
