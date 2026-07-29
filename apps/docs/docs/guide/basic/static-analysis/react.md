---
title: React 静态分析
description: React JSX、useI18n() 返回的 t 与组件刷新规则
---

本页只介绍 React 特有规则。参数静态求值、文案树和宏的通用规则见
[通用静态分析](./common)。

## 支持的源码

React 模式分析 JS、TS、JSX 与 TSX 文件。普通 JSX 文本不会自动提取，文案必须传给翻译
API。

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

| 写法                                        | 提取 | 语言切换行为                 |
| ------------------------------------------- | ---- | ---------------------------- |
| 组件渲染使用 Runtime 顶层 `t`               | 是   | 不建立订阅，不会主动重新渲染 |
| 组件渲染使用 `useI18n()` 返回的 `t`         | 是   | 建立 React 订阅并重新渲染    |
| 事件回调或普通延迟函数使用 Runtime 顶层 `t` | 是   | 调用时读取当前语言           |

React 适配器使用 `useSyncExternalStore` 订阅 Runtime revision。revision 改变时，Hook 返回的
`t` 会获得新的函数引用，依赖该引用的缓存可以正确失效。`"use memo"` 或 `"use no memo"`
不能替代 `useI18n()` 的订阅边界。

`ai-i18n/no-unsubscribed-t` 会检查 JSX / TSX 渲染路径中的无订阅 Runtime `t`。规则不会追踪
任意跨函数或跨文件数据流，完整边界见 [ESLint](/guide/quality/eslint)。
