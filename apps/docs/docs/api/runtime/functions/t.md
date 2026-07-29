---
title: t()
description: 翻译静态文案或带动态值的模板字符串
---

从 `virtual:ai-i18n` 导入：

```ts
import { t } from 'virtual:ai-i18n';
```

## 签名

```ts
function t(source: string, options?: TranslationOptions): string;
function t(strings: TemplateStringsArray, ...values: unknown[]): string;
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

message ID 由 `source` 和去除首尾空白后的 `comment` 共同生成。没有 comment 时通常就是 source；
有 comment 时可读形式类似 `提交#创建 Git 提交`。正文或 comment 中的 `#` 和 `\` 会自动转义。

## Tagged template

动态值使用 tagged template：

```ts
t`你好 ${user.name}，你有 ${unreadCount} 条消息`;
```

表达式会变成 `{{0}}`、`{{1}}` 等占位符，不会交给翻译模型。译文可以调整占位符顺序，
Runtime 会在展示前填入原始值。

源码中原样出现的 `{{0}}` 会在内部协议中转义为 `{{=0}}`，最终仍显示为 `{{0}}`。

Runtime 会比较源文与译文的占位符。译文缺少、多出或改变编号时，浏览器输出 warning，
但仍继续使用该译文。

## 返回值

返回当前语言的译文。译文缺失或值为 `null` 时返回 source 文案。

:::warning 不要长期保存译后字符串
已经写入 state、storage、请求体或文件元数据的字符串不会随语言切换更新。持久数据和业务判断
应保存稳定的语义 code、序号或消息标识，并在展示层调用 `t()`。模块初始化时的
`const label = t('保存')` 也是一次性快照；普通模块可改为
`const getLabel = () => t('保存')`。
:::

Vue / React 组件应使用 [`useI18n()`](/api/runtime/framework-api/use-i18n) 返回的 `t` 建立
语言变化订阅。Runtime 顶层 `t` 即使位于组件渲染函数中，也不会自行触发组件更新。对应
ESLint 生命周期检查见 [ESLint](/guide/quality/eslint)。

Vue setup 中需要预先声明响应式 label 时，使用 Vue-only
[`tRef()`](/api/runtime/framework-api/t-ref)。`t()` 始终返回字符串，不会因为调用位置不同而
改成 Ref。

静态提取支持的表达式见[静态分析范围](/guide/basic/static-analysis)。
