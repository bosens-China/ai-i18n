---
title: t()
description: 翻译静态文案、文案树或带动态值的模板字符串
---

从 `virtual:ai-i18n` 导入：

```ts
import { t } from 'virtual:ai-i18n';
```

## 签名

```ts
function t(source: string, options?: TranslationOptions): string;
function t(strings: TemplateStringsArray, ...values: unknown[]): string;
function t<T extends MessageTree>(messages: T): TranslatedMessageTree<T>;
```

## 参数

| 参数      | 类型                                                             | 必填 | 作用                          |
| --------- | ---------------------------------------------------------------- | ---- | ----------------------------- |
| `source`  | `string`                                                         | 是   | 源文案，也是缺译时的回退值。  |
| `options` | [`TranslationOptions`](/api/vite/interfaces/translation-options) | 否   | 通过 `comment` 补充翻译语境。 |

source 与 options 必须能在构建期静态求值。

```ts
t('保存');
t('保存', { comment: '按钮' });
t('提交', { comment: '创建 Git 提交' });
```

## 文案树

整棵静态对象或数组可以直接传给 `t()`。每个字符串叶子都会翻译，返回值保持原有结构；
数字、布尔值、`bigint`、`null` 与 `undefined` 原样保留：

```ts
// messages.ts
export const messages = {
  actions: {
    save: '保存',
    cancel: '取消',
  },
  states: ['等待中', '处理中'],
  maxRetries: 3,
};

// React 组件或普通模块
const labels = t(messages);
// labels.actions.save: string
// labels.states: string[]
// labels.maxRetries: number
```

本地或导入的静态 `const` 都可以使用，不需要 `as const`，也不需要
`defineI18nMessages()`。文案树应当是纯文案结构：只使用普通对象、数组和上述叶子值；
不要混入路由、业务 key 等不应翻译的字符串，也不支持 `Map`、`Set`、函数、循环引用、
getter 或其他运行时结果。

整棵树调用不能为单个叶子设置 `comment`，也不能在叶子中使用 tagged template 插值。
需要成员级语境或动态索引时，改用
[`defineI18nMessages()`](/api/runtime/macros/define-i18n-messages) 后逐项调用 `t()`。

相同原文搭配不同的 `comment` 会作为不同语境分别翻译。没有 `comment` 时，同一原文默认共享译文。

## Tagged template

动态值使用 tagged template：

```ts
t`你好 ${user.name}，你有 ${unreadCount} 条消息`;
```

表达式会变成 `{{0}}`、`{{1}}` 等占位符，不会交给翻译模型。译文可以调整占位符顺序，
Runtime 会在展示前填入原始值。

Runtime 会比较源文与译文的占位符。译文缺少、多出或改变编号时，浏览器输出 warning，
但仍继续使用该译文。

## 返回值

字符串调用返回当前语言的译文；译文缺失或值为 `null` 时返回 source 文案。文案树调用返回
形状相同的新对象或数组，其中每个字符串叶子按相同规则翻译；不会修改输入值。

:::warning 不要长期保存译后字符串
已经写入 state、storage、请求体或文件元数据的字符串不会随语言切换更新。持久数据和业务判断
应保存稳定的语义 code、序号或消息标识，并在展示层调用 `t()`。模块初始化时的
`const label = t('保存')` 也是一次性快照；普通模块可改为
`const getLabel = () => t('保存')`。
:::

Vue 组件应使用 [Vue `useI18n()`](/api/runtime/vue/use-i18n)，React 组件应使用
[React `useI18n()`](/api/runtime/react/use-i18n)。两者返回的 `t` 会建立语言变化订阅。
Runtime 顶层 `t` 即使位于组件渲染函数中，也不会自行触发组件更新。对应 ESLint 生命周期
检查见 [ESLint](/guide/quality/eslint)。

Vue setup 中需要预先声明响应式 label 时，使用 Vue-only
[`tRef()`](/api/runtime/vue/t-ref)。`t()` 的字符串输入返回字符串，文案树输入
返回翻译后的同形结构；两者都不会因为调用位置不同而变成 Ref。

支持的文案写法见[通用文案写法](/guide/basic/static-analysis/common)。
