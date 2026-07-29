---
title: TranslatedMessageTree
description: 保持文案树结构的翻译结果类型
---

从 `@ai-i18n/vite` 导入类型：

```ts
import type { TranslatedMessageTree } from '@ai-i18n/vite';
```

## 定义

```ts
type TranslatedMessageTree<T> = T extends string
  ? string
  : T extends readonly unknown[]
    ? { [K in keyof T]: TranslatedMessageTree<T[K]> }
    : T extends object
      ? { [K in keyof T]: TranslatedMessageTree<T[K]> }
      : T;
```

该类型递归保留对象、数组和非字符串叶子的结构，只把字符串叶子映射为译文字符串。
[`t()`](/api/runtime/functions/t) 返回该结构的当前快照；Vue
[`tRef()`](/api/runtime/vue/t-ref) 返回包含该结构的只读计算属性。
