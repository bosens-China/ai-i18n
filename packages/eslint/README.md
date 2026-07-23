# @ai-i18n/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取的 `t()` 参数。规则检查解析到
`virtual:ai-i18n` 的 `t` binding，以及 Vue/React `useI18n()` 解构或对象成员得到的 `t`。
其他库或局部同名函数不受影响。

## 默认配置

默认配置适用于宿主 ESLint 已识别的 JavaScript、TypeScript、JSX 和 TSX 文件。
它同时覆盖 Vanilla、React 和普通 TypeScript 文件中的 Vue Hook，不会安装或启用
React Hooks、React Refresh 等框架规则。

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [...aiI18n.configs.recommended];
```

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
  ...aiI18n.configs.recommended,
  ...aiI18n.configs.vue,
];
```

`configs.vue` 复用宿主的 Vue parser，只启用同一条 `t-static-args` 规则。语义分析使用
Vue 项目已有的 `@vue/compiler-sfc`，与 Vite 提取器共享编译结果和 source map，覆盖
`<script>`、`<script setup>`、模板插值和指令表达式。两个 Vue 依赖均为可选 peer，
不会安装到 React/Vanilla 项目。

同一项目可以同时检查 Vue JSX 与 React JSX。ai-i18n 根据 `@ai-i18n/vue` 或
`@ai-i18n/react` 的 Hook import 自动判断框架，不依赖文件命名。宿主编译可以默认使用
React，并通过 Vue JSX 插件的 `include` glob 声明少量 Vue 文件；单文件仍只允许一种 Runtime。

规则与 Vite 共用静态参数语义，包括 `i18n.t()`、`i18n['t']()` 和省略式
`t('source', undefined)`。未绑定到 ai-i18n 的 template-only `t()` 不参与检查。

需要解析 `tsconfig` 路径别名时，可以显式配置规则：

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [
  {
    plugins: { 'ai-i18n': aiI18n },
    rules: {
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

插件不会自动修改宿主 ESLint 配置。
