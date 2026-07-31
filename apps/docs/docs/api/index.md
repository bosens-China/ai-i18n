---
title: API 总览
description: 按导入入口与符号类型查找 ai-i18n 的公开 API
---

API 参考按导入入口组织。选择入口后，再按函数、接口、类型别名或编译宏查找具体符号。

| 入口                   | 用途                                              |
| ---------------------- | ------------------------------------------------- |
| `@ai-i18n/vite`        | 注册 Vite 插件，配置提取、翻译和自定义 Provider。 |
| `@ai-i18n/vite/vitest` | 在 Vitest 中提供内存 Runtime 与编译宏转换。       |
| `virtual:ai-i18n`      | 在浏览器业务代码中翻译文案和切换语言。            |
| `@ai-i18n/openai`      | 创建 OpenAI-compatible Translator。               |

## 查找入口

- 配置插件：[`aiI18n()`](/api/vite/functions/ai-i18n)
- 查询全部插件选项：[`AiI18nOptions`](/api/vite/interfaces/ai-i18n-options)
- 翻译文案：[`t()`](/api/runtime/functions/t)
- 在 Vue setup 中创建响应式翻译值：[`tRef()`](/api/runtime/vue/t-ref)
- 读取语言资源加载状态：[`getLangLoadState()`](/api/runtime/functions/get-lang-load-state)
- 在 Vue 中读取响应式语言状态：[`useI18n()`](/api/runtime/vue/use-i18n)
- 在 React 中订阅语言变化：[`useI18n()`](/api/runtime/react/use-i18n)
- 配置 Vitest：[`aiI18nVitest()`](/api/vitest/functions/ai-i18n-vitest)
- 连接模型：[`openAI()`](/api/openai/functions/open-ai)
- 实现自定义翻译器：[`Translator`](/api/vite/type-aliases/translator)

## Reference 范围

本节记录应用接入所依赖的公开契约。Analyzer、文件 Schema、Translation Memory 事务和框架
适配器等低层基础设施不作为普通应用的稳定接入入口。除非文档明确列出，否则不要依赖包中
的其他导出。
