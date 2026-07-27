---
title: subscribe()
description: 订阅 Runtime 的语言和模块更新
---

从 `virtual:ai-i18n` 导入：

```ts
import { subscribe } from 'virtual:ai-i18n';
```

## 签名

```ts
function subscribe(listener: () => void): () => void;
```

## 参数

`listener` 是无参数回调。语言变化或 Runtime 模块更新时，Runtime 会执行该回调。

## 返回值

返回取消订阅函数：

```ts
const unsubscribe = subscribe(render);

unsubscribe();
```

Vue 与 React 组件通常不需要直接订阅。框架模式下使用
[`useI18n()`](/api/runtime/framework-api/use-i18n) 即可。
