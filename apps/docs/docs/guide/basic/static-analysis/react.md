---
title: React 文案写法
description: 在 React 组件中使用 useI18n() 翻译并响应语言切换
---

本页只介绍 React 特有写法。参数、文案树和宏的通用规则见[通用文案写法](./common)。

## 支持的源码

React 模式分析 `.js`、`.mjs`、`.ts`、`.mts`、`.jsx` 与 `.tsx` ESM 源码。不支持
`.cjs`、`.cts` 或 CommonJS 调用方式。普通 JSX 文本不会自动提取，文案必须传给翻译 API。

## `useI18n()` 返回的 `t`

分析器识别直接从 `useI18n()` 返回值获得的 `t`，包括解构、改名和对象成员调用：

```tsx
const { t: translate } = useI18n();
const i18n = useI18n();

translate('保存');
i18n.t('取消');
i18n['t']('返回');
```

解构或改名只改变本地变量名。`t` 仍然来自 Hook，因此不会切断语言切换时的组件刷新。
它与顶层 `t()` 使用相同的静态参数规则：

```tsx
const { t } = useI18n();

const title = t('订单详情');
const labels = t({ save: '保存', cancel: '取消' });

const messages = defineI18nMessages({ save: '保存' });
const saveLabel = t(messages.save);
```

从 Hook 结果二次解构，或直接调用 `useI18n().t()`，不在推荐范围内：

```tsx
const i18n = useI18n();
const { t } = i18n; // 不支持二次解构

useI18n().t('保存'); // 不支持链式调用
```

完整返回值见 [React `useI18n()` API](/api/runtime/react/use-i18n)。

## 提取与组件刷新

| 写法                                | 提取 | 语言切换行为                 |
| ----------------------------------- | ---- | ---------------------------- |
| 组件渲染使用顶层 `t`                | 是   | 不建立订阅，不会主动重新渲染 |
| 组件渲染使用 `useI18n()` 返回的 `t` | 是   | 建立 React 订阅并重新渲染    |
| 事件回调或普通延迟函数使用顶层 `t`  | 是   | 调用时读取当前语言           |

`useI18n()` 会订阅语言变化，因此无需额外处理 React Compiler 或缓存。无论是否启用 React Compiler，
组件渲染都应使用 Hook 返回的 `t`。

`ai-i18n/no-unsubscribed-t` 会检查 JSX / TSX 渲染路径中未订阅的顶层 `t`。完整规则见
[ESLint](/guide/quality/eslint)。
