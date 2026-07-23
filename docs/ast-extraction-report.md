# AST 静态提取能力报告

> 更新日期：2026-07-23  
> 适用范围：当前仓库的 `@boses/analyzer`、`@boses/vite`、
> `@boses/eslint-plugin` 以及 `@boses/vite` 的 Vanilla、Vue、React 三种模式

## 结论

当前实现适合“显式 `t()` + 静态字符串参数”的一期目标。它不是通用 JavaScript 求值器，
也不会猜测普通文本。提取过程分为三层：

1. Yuku 解析 JS、TS、JSX 或 TSX，并建立作用域、符号和跨文件引用。
2. ai-i18n 判断调用是否绑定到约定 Runtime 或框架 `useI18n()`。
3. ai-i18n 只计算白名单内的静态字符串 AST。

“语法能够解析”不等于“表达式能够提取”。例如，Yuku 能解析
`t(prefix + name)`，但当前静态求值器不计算 `BinaryExpression`，因此该调用只会产生 warning。

报告使用以下标记：

- **已验证**：已有专项单元测试或真实 Vite Build 回归。
- **实现支持**：代码分支明确支持，但缺少独立专项测试。
- **不支持**：当前会忽略或产生静态参数 warning。

## 1. JavaScript 和 TypeScript

### 1.1 文件与语法入口

| 能力                      | 状态           | 说明                                                                             |
| ------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `.js`、`.ts`              | 已验证         | 默认进入共享 Yuku 分析链。                                                       |
| `.mjs`、`.mts`            | 已验证         | 使用 ESM import，进入共享 Yuku 分析链。                                          |
| `.cjs`、`.cts`            | 已验证为不支持 | 当前不识别 CommonJS `require()` binding；ESM import 也不是这两类文件的稳定契约。 |
| `.jsx`、`.tsx`            | 已验证         | Vue/React 模式进入共享分析链；Vanilla 模式主动忽略。                             |
| TypeScript 类型标注       | 已验证         | 例如 `const value: string = t('文案')`。                                         |
| decorator                 | 已验证         | 已覆盖 decorator 与翻译调用同时存在的文件。                                      |
| dynamic `import()`        | 已验证         | 文件可以解析；它本身不产生翻译消息。                                             |
| import、export、re-export | 已验证         | 支持别名、re-export 和跨文件符号链接。                                           |

Yuku 实际可以解析更多 ECMAScript/TypeScript 语法，但目前只有表中的语法进入项目准入回归，
因此不把未测试语法列为稳定契约。

### 1.2 可识别的翻译调用

| 写法                                             | 状态   | 说明                                                     |
| ------------------------------------------------ | ------ | -------------------------------------------------------- |
| `import { t } from 'virtual:ai-i18n'; t('保存')` | 已验证 | Vanilla 基础写法。                                       |
| `import { t as tr } ...; tr('保存')`             | 已验证 | 按 import symbol 识别，不依赖变量名必须为 `t`。          |
| 通过 re-export 引入 `t`                          | 已验证 | Yuku 会链接到约定虚拟模块。                              |
| `const { t } = useI18n(); t('保存')`             | 已验证 | 需要 Vue/React 模式；支持显式 import 或内部自动注入。    |
| `const { t: tr } = useI18n(); tr('保存')`        | 已验证 | 支持 Hook 解构别名。                                     |
| `const i18n = useI18n(); i18n.t('保存')`         | 已验证 | 支持 Hook 返回对象的成员调用。                           |
| `i18n['t']('保存')`                              | 已验证 | 仅支持静态字符串成员名。                                 |
| `useI18n().t('保存')`                            | 不支持 | Hook 结果必须先绑定到变量或完成对象解构。                |
| `const tr = i18n.t; tr('保存')`                  | 不支持 | 当前不追踪成员函数的二次赋值。                           |
| `i18n[key]('保存')`                              | 不支持 | 动态成员名不参与识别。                                   |
| 来自其他模块的同名 `t()`                         | 不支持 | 会按普通业务函数处理，不提取，也不产生翻译参数 warning。 |

显式 Hook import 必须来自统一虚拟模块：

- Vue/React：`virtual:ai-i18n`

开启内部 auto import 后，未绑定的 `useI18n()` 作为同一 Hook binding 处理；局部同名函数仍会
按 symbol identity 排除。

### 1.3 可静态求值的参数 AST

下面的规则同时适用于第一个参数 `source` 和第二个参数 `comment`。

| AST / 写法                                       | 状态     | 提取结果                               |
| ------------------------------------------------ | -------- | -------------------------------------- |
| 字符串 `Literal`：`t('保存')`                    | 已验证   | 提取一个 source。                      |
| 无插值 `TemplateLiteral`：``t(`保存`)``          | 已验证   | 提取一个 source。                      |
| `const` 标识符：`const LABEL = '保存'; t(LABEL)` | 已验证   | 递归求值 initializer。                 |
| 跨文件 imported `const`                          | 已验证   | 依赖完成分析后，跟随 definition 求值。 |
| 多层 `const` 引用                                | 实现支持 | 递归解析，并用 symbol key 防止循环。   |
| 条件表达式：`t(ok ? '成功' : '失败')`            | 已验证   | 两个分支都提取；不计算条件真假。       |
| 括号表达式：`t((LABEL))`                         | 已验证   | 继续计算内部表达式。                   |
| TypeScript `as`：`t(LABEL as string)`            | 已验证   | 支持 `TSAsExpression`。                |
| TypeScript 类型断言：`t(<string>LABEL)`          | 已验证   | 支持 `TSTypeAssertion`。               |
| TypeScript 非空断言：`t(LABEL!)`                 | 已验证   | 支持 `TSNonNullExpression`。           |
| 省略 comment：`t('保存')`                        | 已验证   | comment 为空。                         |
| `undefined` comment：`t('保存', undefined)`      | 已验证   | 未被局部声明遮蔽时，等同省略 comment。 |

以下表达式当前不会被求值：

| AST / 写法                         | 当前行为          |
| ---------------------------------- | ----------------- |
| 字符串拼接：`t('保' + '存')`       | warning，不提取。 |
| 带插值模板：``t(`欢迎 ${name}`)``  | warning，不提取。 |
| `let`、`var` 或可变变量            | warning，不提取。 |
| 对象成员：`t(labels.save)`         | warning，不提取。 |
| 函数返回值：`t(getLabel())`        | warning，不提取。 |
| 逻辑表达式：`t(label \|\| '默认')` | warning，不提取。 |
| 数组、对象、数字、布尔值、`null`   | warning，不提取。 |
| 超过两个参数                       | warning，不提取。 |

当 imported `const` 尚未进入模块图时，结果保持 `pending: true`，同时输出带源码位置的
warning。依赖加载并重新链接后，ProjectState 会重新计算受影响模块。

## 2. React

React adapter 不创建第二套 AST。React 模式让 JSX/TSX 进入共享分析链，并声明
`virtual:ai-i18n/useI18n().t` 的 Hook 语义。

检测到 React Vite 插件或显式设置 `framework: 'react'` 后，Hook 语义会作用于完整的
JS/TS 模块图，而不只作用于 React 组件文件。

| React 场景                               | 状态     | 说明                                  |
| ---------------------------------------- | -------- | ------------------------------------- |
| 函数组件中的 `useI18n()`                 | 已验证   | 支持解构、import alias 和 `t` alias。 |
| JSX expression：`<h1>{t('标题')}</h1>`   | 已验证   | 只提取 expression 内的显式调用。      |
| JSX 属性 expression：`title={t('提示')}` | 实现支持 | Yuku 会遍历其中的 `CallExpression`。  |
| 普通 `.ts` custom Hook                   | 已验证   | 真实 Vite Build 已验证协议文件生成。  |
| 普通 `.js` custom Hook                   | 实现支持 | 与 `.ts` 使用同一 Hook symbol 规则。  |
| `const i18n = useI18n(); i18n.t()`       | 已验证   | 支持成员形式。                        |
| 直接导入 `virtual:ai-i18n`               | 已验证   | 仍使用 Vanilla 规则。                 |
| JSXText：`<p>普通文本</p>`               | 不支持   | 不猜测普通 JSX 文本。                 |
| 静态 JSX 属性：`title="普通属性"`        | 不支持   | 必须显式调用 `t()`。                  |
| 其他库的 `useI18n()` 或 `t()`            | 不支持   | 模块来源不匹配时忽略。                |
| SSR / React Server Component 翻译        | 不支持   | 当前 Vite 插件跳过 SSR transform。    |

React 的组件、Fragment、事件函数或 JSX 嵌套层级不会改变提取规则。只要调用绑定正确，
参数满足第 1.3 节的静态求值规则，就可以提取。

## 3. Vue

Vue SFC 使用下列流程：

```text
.vue
  → @vue/compiler-sfc parse
  → compileScript({ inlineTemplate: true, sourceMap: true })
  → 共享 Yuku symbol/AST 分析
  → source map 映射回原始 SFC 行列
```

这套流程保留了 `<script setup>` binding、模板局部变量和双 script 的真实作用域，
不再通过字符串改写猜测模板里的 `t()`。

| Vue 场景                                | 状态     | 说明                                                          |
| --------------------------------------- | -------- | ------------------------------------------------------------- |
| `<script setup lang="ts">` 中的 Hook    | 已验证   | 推荐路径。支持解构、alias 和成员调用。                        |
| 模板插值：`{{ t('标题') }}`             | 已验证   | `t` 必须绑定到 `<script setup>` Hook。                        |
| `v-bind`：`:title="t('提示')"`          | 已验证   | 编译后进入共享 `CallExpression` 分析。                        |
| 其他可编译指令表达式                    | 实现支持 | 与插值、`v-bind` 共用 compiler-sfc 输出，缺少逐指令专项测试。 |
| 普通 `<script>` 内的显式调用            | 已验证   | script 自身进入 Yuku 分析。                                   |
| 同时存在 `<script>` 与 `<script setup>` | 已验证   | 两个作用域由 compiler-sfc 保留。                              |
| 普通 JS/TS composable                   | 已验证   | Vue Hook 语义会应用到完整 JS/TS 模块图。                      |
| 外部 `<script src>`                     | 已验证   | 按外部 JS/TS 文件提取，协议 source 也是外部文件。             |
| SFC 原始源码位置                        | 已验证   | compiler source map 映射回 `.vue` 的原始 line 和 column。     |
| `v-for` 局部变量遮蔽                    | 已验证   | 局部 symbol 不会误判为 Hook 返回的 `t`。                      |
| slot scope 局部变量遮蔽                 | 已验证   | slot prop 使用独立 symbol，不会误判为外层 Hook binding。      |
| 普通模板文本                            | 不支持   | 例如 `<p>保存</p>` 不提取。                                   |
| 静态模板属性                            | 不支持   | 例如 `title="保存"` 不提取。                                  |
| 组件上下文中的同名 `t`                  | 不支持   | `_ctx.t` 没有绑定到 ai-i18n Hook，主动忽略。                  |
| template-only SFC 中直接写 `t()`        | 不支持   | 没有可证明的 Hook binding。                                   |
| Options API `setup()` 返回 `t` 给模板   | 不支持   | 当前不追踪返回对象到模板。                                    |
| `<style>` 和 custom block               | 不支持   | 不参与翻译 AST 分析。                                         |
| Vue JSX/TSX Hook                        | 已验证   | Vue 模式支持显式或自动注入的 `virtual:ai-i18n` Hook binding。 |

普通 `<script>` 内部的 `t()` 仍可提取，但模板需要绑定 Hook 时应使用
`<script setup lang="ts">`。外部脚本也只提取脚本中实际出现的调用，不推导 Options API
返回对象和模板之间的关系。

## 3.1 JSX 框架边界

每个 Vite build 只允许一种 JSX Runtime。Vue 模式由 `@vitejs/plugin-vue-jsx` 编译 Vue
JSX/TSX，React 模式由 React Vite 插件编译 React JSX/TSX；同时检测到两种插件族会报错。
微前端仓库可以让各子应用使用独立 Vite build，各自选择模式。

## 4. 变量遮蔽

### 4.1 处理原则

当前实现按 **symbol identity** 判断，不按变量名称判断：

- import binding、函数参数、块级变量和模板局部变量各自拥有不同 symbol。
- 只有已登记的 Runtime `t` symbol、Hook 解构得到的 symbol，或 Hook 结果对象 symbol 才能提取。
- `const` 参数求值同样跟随当前引用实际解析到的 symbol，不会按名称全局查找。

因此，局部同名变量不会污染外层翻译 binding。

### 4.2 JavaScript / TypeScript 示例

```ts
import { t } from 'virtual:ai-i18n';

t('外层提取');

function render(t: (value: string) => string) {
  t('参数遮蔽，不提取');
}

{
  const t = console.log;
  t('块级遮蔽，不提取');
}
```

`render()` 参数和块级 `t` 都不是 import symbol，因此不会提取。

Hook alias 也遵循相同规则：

```ts
import { useI18n } from 'virtual:ai-i18n';

const { t: translate } = useI18n();
translate('外层提取');

function run(translate: (value: string) => string) {
  translate('参数遮蔽，不提取');
}
```

### 4.3 Vue 模板示例

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { t: translate } = useI18n();
const items = [() => 'local'];
</script>

<template>
  <p>{{ translate('提取') }}</p>
  <p>{{ t('组件上下文，不提取') }}</p>
  <p v-for="translate in items">
    {{ translate('v-for 局部变量，不提取') }}
  </p>
</template>
```

compiler-sfc 会把 `v-for` alias 编译为局部参数。Yuku 随后把该参数解析成新的 symbol，
因此不会与 `<script setup>` 中的 `translate` 混淆。

双 script 中的同名常量也不会串线：

```vue
<script lang="ts">
const LABEL = '普通脚本';
</script>

<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { t } = useI18n();
const LABEL = 'setup 脚本';
</script>

<template>{{ t(LABEL) }}</template>
```

模板中的 `LABEL` 绑定到 `<script setup>` symbol，所以只提取“setup 脚本”。该行为已有回归测试。

### 4.4 遮蔽处理的边界

- `undefined` comment 仅在 `undefined` 没有被局部声明时视为“省略 comment”。局部声明的
  `undefined` 会按普通动态参数处理。
- 当前只跟踪直接 binding，不跟踪 `const tr = i18n.t` 这类二次函数引用。
- Vue slot scope 使用 compiler-sfc 的局部作用域，并已覆盖同名 slot prop 的负向回归。
- Options API 返回对象到模板不在符号追踪范围内。

## 5. 评估与建议

当前能力已经覆盖推荐接入方式：

- Vanilla 使用 `virtual:ai-i18n` 的显式 `t()`。
- React 使用函数组件或 custom Hook 中的 `useI18n()`。
- Vue 使用 Composition API 和 `<script setup lang="ts">`。
- source 与 comment 使用字面量、静态 `const` 或静态条件分支。

暂时不建议把静态求值器扩展成通用 JavaScript 执行器。若真实项目出现稳定需求，可按以下顺序补充：

1. 为剩余实现支持但未专项验证的路径补测试，例如其他 Vue 指令表达式。
2. 按实际使用频率增加安全的纯表达式，例如字符串 `BinaryExpression`。
3. 只有 Options API 仍是正式支持目标时，才设计 `setup()` 返回对象到模板的符号追踪。

不建议执行任意函数或依赖运行时值。这会让 Build 结果不稳定，并扩大静态提取的副作用边界。

## 6. 实现与测试依据

- 共享 JS/TS/JSX/TSX AST 与静态求值：`packages/analyzer/src/index.ts`
- 共享 Vue SFC 编译和位置映射：`packages/analyzer/src/vue.ts`
- extractor 契约：`packages/vite/src/extractor.ts`
- 框架模式、插件检测与声明生成：`packages/vite/src/framework.ts`
- Vue/React Runtime adapter：`packages/vite/src/vue.ts`、`packages/vite/src/react.ts`
- ESLint 适配：`packages/eslint/src/analyze.ts`、`packages/eslint/src/vue-sfc.ts`
- Yuku 准入测试：`packages/vite/test/yuku-spike.test.ts`
- React adapter 测试：`packages/vite/test/react-runtime.test.ts`
- Vue scope 测试：`packages/vite/test/vue-extraction.test.ts`
- React/Vue 真实 Vite Build：`packages/vite/test/react-integration.test.ts`、
  `packages/vite/test/vue-integration.test.ts`
