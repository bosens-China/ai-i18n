---
title: getLangs()
description: 返回配置的语言列表快照
---

从 `virtual:ai-i18n` 导入：

```ts
import { getLangs } from 'virtual:ai-i18n';
```

## 签名

```ts
function getLangs(): readonly LangOption[];
```

## 返回值

返回 [`AiI18nOptions.locales`](/api/vite/interfaces/ai-i18n-options) 的快照。每一项都包含必填的
`value` 与 `label`。

修改返回的对象不会改变 Runtime 内部配置。

```ts
for (const locale of getLangs()) {
  console.log(locale.value, locale.label);
}
```

字段定义见 [`LangOption`](/api/vite/interfaces/lang-option)。
