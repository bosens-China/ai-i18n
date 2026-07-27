---
title: setLang()
description: 加载并切换当前语言
---

从 `virtual:ai-i18n` 导入：

```ts
import { setLang } from 'virtual:ai-i18n';
```

## 签名

```ts
function setLang(value: string): Promise<void>;
```

## 参数

`value` 必须匹配 [`AiI18nOptions.locales`](/api/vite/interfaces/ai-i18n-options) 中的某个
`value`。不支持的值会抛出 `RangeError`。

## 行为

没有启用语言分包时，Runtime 会立即提交切换。启用 `loading` 后，Runtime 先加载目标语言
chunk，再切换语言并通知订阅者。

相同 locale 的并发加载共享一个 Promise。不同 locale 的并发切换以最后一次调用为准。
加载失败时 Promise 会 reject，当前语言保持不变。

配置 `persist` 后，切换成功的语言会写入 localStorage。

## 示例

```ts
try {
  await setLang('en-US');
} catch {
  // 保留当前语言，并向用户提供重试入口。
}
```

按需加载的完整示例见[语言分包与按需加载](/guide/basic/locale-loading)。
