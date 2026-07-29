---
title: 通用静态分析
description: ai-i18n 通用的源码范围、可提取参数、推荐语法与 AST 分析限制
---

ai-i18n 只分析明确调用翻译 API 的源码，不会猜测哪些自然语言需要翻译。分析过程只读取
抽象语法树（AST），不会执行项目代码。

本页介绍三个框架模式共用的规则。框架差异见 [Vue 静态分析](./vue) 和
[React 静态分析](./react)。

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

分析器识别从 `virtual:ai-i18n` 导入的 `t`，并支持在 import 位置改名：

```ts
import { t as translate } from 'virtual:ai-i18n';

translate('保存');
```

Vue 或 React 构建中的普通 `.js` / `.ts` 工具模块也可以显式导入顶层 `t`：

```ts
import { t } from 'virtual:ai-i18n';

export const getRetryMessage = () => t('请重试');
```

框架模式由整个 Vite 构建决定，不会因为当前文件是 `.ts` 就切换为 Vanilla。

开启 [自动导入](/guide/basic/auto-import) 后，分析器也会识别没有本地绑定的全局调用。
局部变量、参数或显式 import 始终优先，不会被当作自动导入 API。

二次赋值 `t`、命名空间 import 和 CommonJS `require()` 不在推荐范围内。

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

分析器会提取所有字符串叶子。本地或导入的静态 `const` 都支持，不要求 `as const`。
整树调用本身就是提取边界，因此不需要宏。

需要按属性或索引挑选单条文案时，使用无需 import 的编译宏：

```ts
const messages = defineI18nMessages({
  actions: { save: '保存', cancel: '取消' },
  states: ['等待中', '处理中', '已完成'],
});

t(messages.actions.save);
t(messages.states[index]);
```

宏集合支持嵌套对象、数组、静态计算属性、静态 spread、固定索引和有限动态索引。动态索引会
枚举 AST 中可以证明的候选值。宏在 Vite 与 `aiI18nVitest()` 转换时消除为原参数，不会冻结、
拷贝、校验或执行对象。

`defineI18nMessages()` 同样适用于普通 `.js` / `.ts` 文件。它不需要 import；TypeScript
类型来自 Vite 生成的 `ai-i18n.d.ts`。如果编辑器找不到该名字，请先生成声明文件并检查
`tsconfig.json` 的 `include`，不要为宏添加运行时实现。

翻译注释同样需要静态求值：

```ts
t('保存', { comment: '工具栏按钮' });

const options = { comment: '结算按钮' };
t('提交', options);
```

`comment` 提供翻译语境，并参与 message ID。

## 提取能力与推荐语法

Vite Analyzer 会尽量保留可恢复的静态文案；ESLint 负责约束可维护的业务写法。因此，
“能够提取”不等于“推荐使用”。

| 写法                                        | Vite 提取            | ESLint           |
| ------------------------------------------- | -------------------- | ---------------- |
| `t('保存')`                                 | 提取                 | 允许             |
| `const label = '保存'; t(label)`            | 提取                 | 允许             |
| `t(ok ? '保存' : '取消')`                   | 提取两个候选         | 允许             |
| `` t`你好 ${name}` ``                       | 提取编号模板         | 允许             |
| `t({ save: '保存', states: ['等待中'] })`   | 提取所有字符串叶子   | 允许             |
| `t(messages.states[index])`，集合已用宏标记 | 提取有限候选         | 允许             |
| `t('保' + '存')`                            | 尽力提取             | 报错             |
| `t(ok && '保存')`                           | 尽力提取             | 报错             |
| `let label = '保存'; t(label)`              | 未发生写入时尽力提取 | 报错             |
| 普通对象或数组成员传给 `t()`                | 尽力提取             | 报错并建议使用宏 |

建议在项目中启用 [ESLint](/guide/quality/eslint)，让本地检查与构建提取保持一致。

## 提取成功不等于会刷新

Analyzer 负责证明文案能在构建期提取。语言切换后的刷新还取决于 `t()` 的执行时机：

| 写法                                      | 提取 | 语言切换行为                   |
| ----------------------------------------- | ---- | ------------------------------ |
| `export const label = t('保存')`          | 是   | 初始化时保存快照，不会自动更新 |
| `export const getLabel = () => t('保存')` | 是   | 每次调用读取当前语言           |

组件还需要建立框架订阅。具体规则见 [Vue 静态分析](./vue) 和
[React 静态分析](./react)。

## 分析限制

- 不提取普通字符串、普通 JSX 文本、普通 Vue 模板文本或普通 HTML 文本。
- `t(variable)` 只有在变量能被静态求值时才会提取。函数调用、getter、`await`、
  `JSON.parse()` 和其他运行时结果不会在分析阶段执行。
- `props.label` 等运行时成员只会报告无法静态提取。只有本地或导入的、可静态解析为对象或
  数组集合的成员才会建议使用 `defineI18nMessages()`。
- 整棵文案树只支持普通对象、数组，以及字符串、数字、布尔值、`bigint`、`null`、
  `undefined` 叶子。所有字符串叶子都会被当作文案；不要混入路由或业务 key。
- `Map`、`Set`、函数、getter、循环引用和运行时生成的集合不受支持。
- 整树调用不支持逐叶 `comment` 或 tagged template 插值；需要这些能力时逐项调用 `t()`。
- `defineI18nMessages()` 必须直接调用，不能赋值给别名、作为参数传递或当作运行时工具。
- Vite 不限制静态候选数量。ESLint 默认在单个表达式超过 1000 个 source/options 组合时
  发出警告；整树调用按去重后的字符串叶子计数，但不会截断 Vite 提取。
- Dev 只分析浏览器实际请求到的模块；Build 只分析从入口可达的模块。未访问的懒路由和
  Build 不可达文件不会进入当前提取结果。
- SSR 阶段会跳过提取、注册与 Runtime 注入；当前 Runtime 只支持浏览器端。

函数签名、占位符转义和 message ID 规则见 [`t()`](/api/runtime/functions/t)。
