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
  cache?: AiI18nCacheOptions;
  provider?: AiI18nProviderOptions;
  directory?: string;
  cleanup?: {
    missingSourceFiles?: boolean;
    orphanMessages?: boolean;
  };
  html?: boolean | HtmlExtractorOptions;
}
```

## 字段

| 字段          | 类型                                                                                | 必填 | 默认值               | 作用                                 |
| ------------- | ----------------------------------------------------------------------------------- | ---- | -------------------- | ------------------------------------ |
| `sourceLang`  | `string`                                                                            | 是   | 无                   | 源码文案所属语言。                   |
| `locales`     | [`readonly LangOption[]`](/api/vite/interfaces/lang-option)                         | 是   | 无                   | 项目支持的语言列表。                 |
| `defaultLang` | `string`                                                                            | 否   | `sourceLang`         | 没有有效持久化值时使用的初始语言。   |
| `persist`     | `boolean` 或 [`AiI18nPersistOptions`](/api/vite/interfaces/ai-i18n-persist-options) | 否   | `false`              | 使用 localStorage 保存语言偏好。     |
| `loading`     | [`AiI18nLocaleLoadingOptions`](/api/vite/interfaces/ai-i18n-locale-loading-options) | 否   | 全语言注册           | 按 locale 拆分语言资产。             |
| `framework`   | [`AiI18nFramework`](/api/vite/type-aliases/ai-i18n-framework)                       | 否   | 自动检测             | 指定 Vanilla、Vue 或 React 模式。    |
| `autoImport`  | `boolean`                                                                           | 否   | `false`              | 自动注入当前框架模式的 Runtime API。 |
| `dts`         | `string \| false`                                                                   | 否   | `'src/ai-i18n.d.ts'` | 设置声明文件路径，或关闭生成。       |
| `directory`   | `string`                                                                            | 否   | `'i18n'`             | 设置相对于 Vite `root` 的协议目录。  |
| `provider`    | [`AiI18nProviderOptions`](/api/vite/type-aliases/ai-i18n-provider-options)          | 否   | 不调用模型           | 配置自动翻译函数与调度策略。         |
| `html`        | [`boolean \| HtmlExtractorOptions`](/api/vite/interfaces/html-extractor-options)    | 否   | `false`              | 开启 `index.html` 文本和属性提取。   |
| `cache`       | [`AiI18nCacheOptions`](/api/vite/interfaces/ai-i18n-cache-options)                  | 否   | 不限制               | 限制历史 Translation Memory 的容量。 |
| `cleanup`     | `{ missingSourceFiles?: boolean; orphanMessages?: boolean }`                        | 否   | 见下文               | 控制失效提取文件和孤立消息的清理。   |

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

`autoImport: true` 注入的 API 取决于最终模式。三种模式都有 `t`、`setLang`、`getLang`、
`getLangs`、`getLangLoadState` 与 `subscribe`；Vue 额外注入 `useI18n`、`tRef`、
`i18nComputed`、`tComputed`，React 额外注入 `useI18n`。

完整接入方法见[自动导入](/guide/basic/auto-import)。

## 清理策略

| 字段                 | 默认值  | 作用                                            |
| -------------------- | ------- | ----------------------------------------------- |
| `missingSourceFiles` | `true`  | 删除源文件不存在时对应的 `extracted` 文件。     |
| `orphanMessages`     | `false` | 保留当前源码不再引用的历史 Translation Memory。 |

建议保留默认值。`orphanMessages: true` 会删除全部非活跃消息，优先级高于 Cache 容量限制。

## 声明文件

默认声明文件始终包含 `virtual:ai-i18n` 和 `defineI18nMessages<T>(value)`。开启自动导入后，
同一文件还会声明当前模式的 Runtime 全局 API。Vue 模式会额外声明 template 中可直接使用的
`t`，供 Volar 与 `vue-tsc` 检查。

只有宿主项目通过其他方式维护等价声明时，才建议设置 `dts: false`。

## 相关内容

- [`aiI18n()`](/api/vite/functions/ai-i18n)
- [语言分包与按需加载](/guide/basic/locale-loading)
- [生成文件与 Git](/guide/basic/directory)
- [ESLint](/guide/quality/eslint)
