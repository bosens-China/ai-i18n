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
interface AiI18nReviewOptions {
  launcher?: boolean;
  printUrl?: boolean;
}

function aiI18nReview(options?: AiI18nReviewOptions): Plugin;
```

Review 插件必须与且只能与一个 `aiI18n()` 核心插件注册在同一个 Vite 配置中。它只在 Dev Server
生效；Build、Preview 和生产产物不会包含入口或工作台。完整注册示例见[翻译校对](/guide/basic/translation-review)。

注册后，业务页面会出现右下角入口，Dev 控制台会打印 `/__ai-i18n/` 的完整地址。页面内工作台默认
浏览当前页面文案，也可切换到全部已提取文案；独立页面默认浏览全部文案。

## 选项

- `launcher`：是否向业务页面注入右下角入口，默认 `true`。设为 `false` 时不会注入客户端脚本。
- `printUrl`：是否在 Vite Dev 控制台打印独立审查地址，默认 `true`。

这两个选项只控制入口提示。完全不需要 Dev Review 时，应移除该插件。

## 相关内容

- [翻译校对](/guide/basic/translation-review)
- [`aiI18n()`](/api/vite/functions/ai-i18n)
