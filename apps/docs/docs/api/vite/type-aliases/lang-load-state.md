---
title: LangLoadState
description: Runtime 的语言资源加载状态快照
---

从 `@ai-i18n/vite` 导入类型：

```ts
import type { LangLoadState } from '@ai-i18n/vite';
```

## 定义

```ts
type LangLoadState =
  | Readonly<{ status: 'idle'; targetLang: null; error: null }>
  | Readonly<{ status: 'loading'; targetLang: string; error: null }>
  | Readonly<{ status: 'error'; targetLang: string; error: unknown }>;
```

## 语义

| `status`  | `targetLang` | `error`   | 含义                         |
| --------- | ------------ | --------- | ---------------------------- |
| `idle`    | `null`       | `null`    | 当前没有语言资源等待或错误。 |
| `loading` | `string`     | `null`    | 正在加载指定目标语言。       |
| `error`   | `string`     | `unknown` | 指定目标语言加载失败。       |

快照及其字段只读。`error` 保留 loader reject 的原始值，可能是 falsy；判断失败必须使用
`status === 'error'`。应用应在展示前把详情映射为自己的用户文案。
读取方式见 [`getLangLoadState()`](/api/runtime/functions/get-lang-load-state)，Vue / React 的
响应式派生值分别见 [Vue `useI18n()`](/api/runtime/vue/use-i18n) 和
[React `useI18n()`](/api/runtime/react/use-i18n)。
