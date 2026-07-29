---
title: MessageTree
description: 可一次翻译的静态纯文案对象或数组
---

从 `@ai-i18n/vite` 导入类型：

```ts
import type { MessageTree, MessageTreeValue } from '@ai-i18n/vite';
```

## 定义

```ts
type MessageTreeValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | undefined
  | readonly MessageTreeValue[]
  | { readonly [key: string]: MessageTreeValue };

type MessageTree =
  readonly MessageTreeValue[] | { readonly [key: string]: MessageTreeValue };
```

每个字符串叶子都是待翻译文案；其他基础类型原样保留。运行时只接受普通对象和数组，不支持
`Map`、`Set`、函数、getter 或循环引用。调用 `t(messages)` 或 Vue `tRef(messages)` 时，
静态本地或导入对象不要求显式标注该类型，也不要求 `as const`。
