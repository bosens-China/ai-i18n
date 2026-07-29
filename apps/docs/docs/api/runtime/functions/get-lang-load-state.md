---
title: getLangLoadState()
description: 读取当前语言资源加载状态快照
---

从 `virtual:ai-i18n` 导入：

```ts
import { getLangLoadState } from 'virtual:ai-i18n';
```

## 签名

```ts
function getLangLoadState(): LangLoadState;

type LangLoadState =
  | { status: 'idle'; targetLang: null; error: null }
  | { status: 'loading'; targetLang: string; error: null }
  | { status: 'error'; targetLang: string; error: unknown };
```

## 返回值

返回当前不可变快照：

- `idle`：当前没有等待中的语言资源，也没有保留的最近加载错误；
- `loading`：正在为 `targetLang` 加载资源；
- `error`：`targetLang` 加载失败，原始异常保存在 `error`。

loader 可以 reject 任意 JavaScript 值，所以 `error` 可能是 falsy。请用
`status === 'error'` 判断失败，不要用 `if (state.error)`。

新的有效语言切换开始时会清除上一条错误。加载成功后恢复 `idle`。不同语言并发切换遵循
last-call-wins，过期请求的完成或失败不会覆盖较新的快照。

## 订阅变化

函数本身只读取一次快照。Vanilla 应用可通过 [`subscribe()`](./subscribe) 监听变化后重新
读取：

```ts
import { getLangLoadState, setLang, subscribe } from 'virtual:ai-i18n';

const unsubscribe = subscribe(() => {
  renderLanguageStatus(getLangLoadState());
});

// 即使 UI 读取共享 error state，也要终结 setLang() 的 rejected Promise。
void setLang('en-US').catch(() => {});
```

Vue 与 React 组件通常直接使用 [`useI18n()`](../framework-api/use-i18n) 返回的响应式状态。
