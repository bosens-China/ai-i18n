# @ai-i18n/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取或不符合推荐语法的 `t()` 参数。规则检查解析到
`virtual:ai-i18n` 的 `t` binding，以及 Vue/React 模式下 `useI18n()` 解构或对象成员得到的
`t`。其他库或局部同名函数不受影响。

alpha 阶段请安装 `@ai-i18n/eslint-plugin@alpha`；peer 支持 ESLint 9 和 10。

## 按模式配置

显式 import 的 Vanilla 项目可以使用 `recommended`。启用 ai-i18n 自动导入时，选择与
Vite `framework` 一致的 preset；它会声明对应只读全局，并启用静态参数报错与候选数量
警告：

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [
  ...aiI18n.configs.vanilla, // 或 .vue / .react
];
```

这些 preset 只负责 ai-i18n 的 `t`/`useI18n`，并在所有模式下声明只读的
`defineI18nMessages` 编译宏。

## Vue SFC

`.vue` 是可选文件格式。Vue 项目应先通过 `eslint-plugin-vue` 配置
`vue-eslint-parser`，再展开 `configs.vue`：

```js
import aiI18n from '@ai-i18n/eslint-plugin';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default [
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  ...aiI18n.configs.vue,
];
```

`configs.vue` 复用宿主的 Vue parser，并启用 `t-static-args` 与
`static-candidate-limit`。语义分析使用
Vue 项目已有的 `@vue/compiler-sfc`，与 Vite 提取器共享编译结果和 source map，覆盖
`<script>`、`<script setup>`、模板插值和指令表达式。两个 Vue 依赖均为可选 peer，
不会安装到 React/Vanilla 项目。

Vue preset 同时覆盖 Vue JSX/TSX，但宿主仍需用 `@vitejs/plugin-vue-jsx` 编译这些文件。
React 项目使用 React preset；同一个 Vite build 不支持两种框架模式混用。

规则与 Vite 共用静态参数语义，包括 `i18n.t()`、`i18n['t']()`、省略式
`t('source', undefined)` 和 tagged template。未绑定到 ai-i18n 的 template-only `t()`
不参与检查。

对象或数组成员只有在根集合由 `defineI18nMessages()` 标记后才属于推荐写法。字符串拼接、
逻辑表达式、`let` 文案、普通集合成员、`const tr = t`、命名空间调用、二次 Hook 解构、
`useI18n().t()` 与 `require()` 都会报错。

需要解析 `tsconfig` 路径别名时，可以显式配置规则：

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [
  {
    languageOptions: {
      globals: { defineI18nMessages: 'readonly' },
    },
    plugins: { 'ai-i18n': aiI18n },
    rules: {
      'ai-i18n/static-candidate-limit': [
        'warn',
        {
          autoImport: true,
          tsconfigPath: './tsconfig.json',
          maxStaticCandidates: 2_000,
        },
      ],
      'ai-i18n/t-static-args': [
        'error',
        {
          tsconfigPath: './tsconfig.json',
        },
      ],
    },
  },
];
```

`ai-i18n/static-candidate-limit` 默认在单个 `t()` 的 source 与 options 组合超过 1000 个
时警告。`maxStaticCandidates` 必须是正整数，只改变 ESLint 的提示阈值；Vite 提取不设
上限，也没有对应插件选项。

插件不会自动修改宿主 ESLint 配置。

诊断默认按 Node 时区选择语言：`Asia/Shanghai` 与 `Asia/Urumqi` 使用中文，其他时区使用
英文。设置 `AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定语言，`auto` 恢复自动
检测。
