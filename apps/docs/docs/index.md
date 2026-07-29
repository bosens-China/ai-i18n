---
pageType: home
title: ai-i18n
description: 面向 Vite 的浏览器端国际化插件，支持静态提取、可选 AI 翻译和 Git 友好的翻译文件。

hero:
  name: ai-i18n
  text: 面向 Vite 的浏览器端 AI 国际化插件
  tagline: 源码直接书写 t('中文')。Vite 在 Dev 与 Build 期间静态提取，并维护可提交到 Git 的 Translation Memory。
  image:
    src: /logo.png
    alt: ai-i18n logo
  actions:
    - theme: brand
      text: 快速上手
      link: /guide/basic/getting-started
    - theme: alt
      text: 在线演示
      link: /demo/vue

features:
  - title: 快速上手
    details: 安装插件，并完成 Vanilla、Vue 3 或 React 的基础配置。
    link: /guide/basic/getting-started
  - title: 静态分析范围
    details: 了解 AST 支持哪些源码与调用写法，以及哪些内容不会提取。
    link: /guide/basic/static-analysis
  - title: 分包与按需加载
    details: 按 locale 拆分 chunk，并显示异步语言切换的加载状态。
    link: /guide/basic/locale-loading
  - title: 配置与 API
    details: 按层级查找 Vite 配置、Runtime 与 Provider 契约。
    link: /api/
  - title: 文件与工作流
    details: 了解 i18n 协议目录、Git 提交约定和冲突处理。
    link: /guide/basic/directory
  - title: AI 翻译
    details: 区分必填与可选字段，并编写可维护的翻译提示词。
    link: /guide/advanced/ai-translation
  - title: AI 工具接入
    details: 安装 Agent Skills，并通过 MCP 安全补齐缺失翻译。
    link: /guide/advanced/ai-tools
---
