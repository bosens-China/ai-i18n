---
title: 通用文案写法
description: 使用 ai-i18n 翻译文案、动态值和文案集合
---

ai-i18n 只处理明确传给翻译 API 的文案，不会猜测哪些普通文本需要翻译。因此，请把需要翻译的
内容写入 `t()`。

本页介绍三个框架共用的写法。框架差异见 [Vue 文案写法](./vue) 和
[React 文案写法](./react)。

## 支持的源码

Vanilla、Vue 和 React 模式都会分析 JS 与 TS 文件。Vue 和 React 还支持各自的组件源码，
具体范围见对应框架页面。

`index.html` 默认不参与提取。设置 `html: true` 后，插件会分析完整的 `t()` 文本节点，
以及 `alt`、`aria-label`、`placeholder`、`title` 属性：

```ts
aiI18n({
  // 省略 sourceLang 与 locales 等基础配置。
  html: true,
});
```

普通 HTML 文本、混合文本（例如 `前缀 t('保存')`）、非白名单属性和内联脚本不会由
HTML 提取器处理。

## 识别 `t()`

可以从 `virtual:ai-i18n` 导入 `t`，也可以在导入时改名：

```ts
import { t as translate } from 'virtual:ai-i18n';

translate('保存');
```

Vue 或 React 构建中的普通 `.js` / `.ts` 工具模块也可以显式导入顶层 `t`：

```ts
import { t } from 'virtual:ai-i18n';

export const getRetryMessage = () => t('请重试');
```

开启 [自动导入](/guide/basic/auto-import) 后，可以省略导入。局部变量、函数参数和显式导入的同名
标识符仍按你的代码处理，不会被覆盖。

## 支持的参数

日常文案优先使用字符串、静态 `const` 或条件表达式：

```ts
t('保存');

const label = '取消';
t(label);

t(canSubmit ? '提交' : '返回');
```

动态值使用 tagged template。表达式会变成可重排的编号占位符，不会发送给翻译模型：

```ts
t`你好 ${user.name}，你有 ${unreadCount} 条消息`;
```

需要一次得到整组译文时，可以直接传入静态纯文案树：

```ts
const messages = {
  actions: { save: '保存', cancel: '取消' },
  states: ['等待中', '处理中', '已完成'],
};

const labels = t(messages);
```

所有字符串叶子都会翻译。本地或导入的静态 `const` 都可使用，不需要 `as const`。

需要按属性或索引挑选单条文案时，使用无需 import 的编译宏：

```ts
const messages = defineI18nMessages({
  actions: { save: '保存', cancel: '取消' },
  states: ['等待中', '处理中', '已完成'],
});

t(messages.actions.save);
t(messages.states[index]);
```

`defineI18nMessages()` 同样适用于普通 `.js` / `.ts` 文件。它不需要 import；TypeScript
类型来自 Vite 生成的 `ai-i18n.d.ts`。如果编辑器找不到该名字，请先启动一次 Vite，并检查
`tsconfig.json` 是否包含声明文件。

翻译注释同样需要静态求值：

```ts
t('保存', { comment: '工具栏按钮' });

const options = { comment: '结算按钮' };
t('提交', options);
```

`comment` 只用于说明翻译语境。相同原文在不同语境下可以得到不同译文。

## 推荐写法与限制

| 写法                                        | Vite 提取          | ESLint           |
| ------------------------------------------- | ------------------ | ---------------- |
| `t('保存')`                                 | 提取               | 允许             |
| `const label = '保存'; t(label)`            | 提取               | 允许             |
| `t(ok ? '保存' : '取消')`                   | 提取两个候选       | 允许             |
| `` t`你好 ${name}` ``                       | 提取编号模板       | 允许             |
| `t({ save: '保存', states: ['等待中'] })`   | 提取所有字符串叶子 | 允许             |
| `t(messages.states[index])`，集合已用宏标记 | 提取有限候选       | 允许             |
| `t('保' + '存')`                            | 不推荐             | 报错             |
| `t(ok && '保存')`                           | 不推荐             | 报错             |
| `let label = '保存'; t(label)`              | 不推荐             | 报错             |
| 普通对象或数组成员传给 `t()`                | 使用宏             | 报错并建议使用宏 |

建议启用 [ESLint](/guide/quality/eslint)，在本地尽早发现不推荐的写法。

## 提取成功不等于会刷新

文案被识别不代表界面会自动刷新。语言切换后的更新还取决于 `t()` 的执行时机：

| 写法                                      | 提取 | 语言切换行为                   |
| ----------------------------------------- | ---- | ------------------------------ |
| `export const label = t('保存')`          | 是   | 初始化时保存快照，不会自动更新 |
| `export const getLabel = () => t('保存')` | 是   | 每次调用读取当前语言           |

组件还需要建立框架订阅。具体规则见 [Vue 文案写法](./vue) 和
[React 文案写法](./react)。

## 不支持的写法

- 不提取普通字符串、普通 JSX 文本、普通 Vue 模板文本或普通 HTML 文本。
- 函数调用、`await`、`JSON.parse()` 和其他运行时结果不能作为 `t()` 参数。
- 普通对象或数组成员需要先用 `defineI18nMessages()` 标记，才能按属性或索引选择文案。
- 文案树只适合普通对象、数组和基础值；不要混入路由、业务 key、函数或运行时数据。
- 普通 JSX、Vue 模板和 HTML 文本不会自动翻译，必须显式调用翻译 API。
- 开发服务器只处理已访问模块；提交或补译前请运行完整 Build。
- 当前运行时只支持浏览器端，不支持 SSR。

完整签名与边界见 [`t()`](/api/runtime/functions/t)。
