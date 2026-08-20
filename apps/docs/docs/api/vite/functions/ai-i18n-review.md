---
title: aiI18nReview()
description: 在 Vite Dev 中显式启用翻译校对工作台
---

从 `@ai-i18n/vite/review` 导入：

```ts
import { aiI18nReview } from '@ai-i18n/vite/review';
```

## 签名

```ts
function aiI18nReview(): Plugin;
```

Review 插件需要与一个 `aiI18n()` 核心插件注册在同一个 Vite 配置中。它只在 Dev Server 生效；
Build、Preview 和生产产物不会包含入口或工作台。

```ts
plugins: [aiI18n({ sourceLang: 'zh-CN', locales }), aiI18nReview()];
```

注册后，业务页面会出现底部入口。工作台使用 Web Component 与 Shadow DOM，第一次打开时才加载
内部工作台 JS 和 UnoCSS。默认浏览当前页面文案，也可切换到全部已提取文案。

## 相关内容

- [翻译校对](/guide/basic/translation-review)
- [`aiI18n()`](/api/vite/functions/ai-i18n)
