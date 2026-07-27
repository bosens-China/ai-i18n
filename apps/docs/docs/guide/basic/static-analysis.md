---
title: 静态分析范围
description: ai-i18n 支持的源码、可提取写法、推荐语法与 AST 分析限制
---

ai-i18n 只分析明确调用翻译 API 的源码，不会扫描项目后猜测哪些自然语言需要翻译。分析过程
只读取抽象语法树（AST），不会执行项目代码。

## 支持的源码

| 框架模式 | 分析范围                   |
| -------- | -------------------------- |
| Vanilla  | JS 与 TS 文件              |
| Vue      | JS、TS、JSX、TSX 与 `.vue` |
| React    | JS、TS、JSX 与 TSX         |

Vue JSX/TSX 项目需要使用 `@vitejs/plugin-vue-jsx`。Vanilla 模式不会分析 JSX/TSX。

Vue SFC 会同时分析 `<script>`、`<script setup>` 和模板表达式。模板中的别名、
`v-for` 局部变量与 slot 局部变量会保留各自作用域，不会把同名函数误判为翻译 API。

`index.html` 默认不参与提取。设置 `html: true` 后，插件会分析完整的 `t()` 文本节点，
以及 `alt`、`aria-label`、`placeholder`、`title` 属性：

```ts
aiI18n({
  // 省略 sourceLang 与 locales 等基础配置。
  html: true, // 提取 index.html 中完整的 t() 文本节点和默认白名单属性
});
```

普通 HTML 文本、混合文本（例如 `前缀 t('保存')`）、非白名单属性和内联脚本不会由
HTML 提取器处理。

## 识别哪些调用

显式导入时，分析器识别来自 `virtual:ai-i18n` 的 `t`，并支持在 import 位置设置别名：

```ts
import { t as translate } from 'virtual:ai-i18n';

translate('保存');
```

Vue 与 React 模式还识别直接从 `useI18n()` 得到的 `t`：

```ts
const { t: translate } = useI18n();
const i18n = useI18n();

translate('保存');
i18n.t('取消');
i18n['t']('返回');
```

开启 [自动导入](/guide/basic/auto-import) 后，分析器也会识别没有本地 binding 的全局调用。
局部变量、参数或显式 import 始终优先，不会被当作自动导入 API。

以下调用来源不在推荐范围内：二次赋值 `t`、命名空间 import、二次解构 Hook 结果、
`useI18n().t()` 和 CommonJS `require()`。

## 支持的参数写法

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

需要按属性或索引组织文案时，使用无需 import 的编译宏：

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

翻译注释同样需要静态求值：

```ts
t('保存', { comment: '工具栏按钮' }); // comment 提供语境并参与 message ID

const options = { comment: '结算按钮' }; // options 也必须能在构建期静态求值
t('提交', options);
```

## 提取能力与推荐语法

Vite Analyzer 会尽量保留可恢复的静态文案；ESLint 则负责约束可维护的业务写法。因此，
“能够提取”不等于“推荐使用”。

| 写法                                        | Vite 提取            | ESLint           |
| ------------------------------------------- | -------------------- | ---------------- |
| `t('保存')`                                 | 提取                 | 允许             |
| `const label = '保存'; t(label)`            | 提取                 | 允许             |
| `t(ok ? '保存' : '取消')`                   | 提取两个候选         | 允许             |
| `` t`你好 ${name}` ``                       | 提取编号模板         | 允许             |
| `t(messages.states[index])`，集合已用宏标记 | 提取有限候选         | 允许             |
| `t('保' + '存')`                            | 尽力提取             | 报错             |
| `t(ok && '保存')`                           | 尽力提取             | 报错             |
| `let label = '保存'; t(label)`              | 未发生写入时尽力提取 | 报错             |
| 普通对象或数组成员传给 `t()`                | 尽力提取             | 报错并建议使用宏 |

建议在项目中启用 [ESLint](/guide/quality/eslint)，让本地检查与构建提取保持一致。

## 分析限制

- 不提取普通字符串、普通 JSX 文本、普通 Vue 模板文本或普通 HTML 文本。
- `t(variable)` 只有在变量能被静态求值时才会提取。函数调用、getter、`await`、
  `JSON.parse()` 和其他运行时结果不会在分析阶段执行。
- `defineI18nMessages()` 必须直接调用，不能赋值给别名、作为参数传递或当作运行时工具。
- Vite 不限制静态候选数量。ESLint 默认在单个表达式超过 1000 个 source/options 组合时
  发出 warning，但不会截断 Vite 提取。
- Dev 只分析浏览器实际请求到的模块；Build 只分析从入口可达的模块。未访问的懒路由和
  Build 不可达文件不会进入当前提取结果。
- SSR 阶段会跳过提取、注册与 Runtime 注入；当前 Runtime 只支持浏览器端。

函数签名、占位符转义和 message ID 规则见 [`t()`](/api/runtime/functions/t)。
