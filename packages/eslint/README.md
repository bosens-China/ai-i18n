# @boses/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取的 `t()` 参数。规则检查解析到
`virtual:ai-i18n` 的 `t` binding，以及 Vue/React 模式下 `useI18n()` 解构或对象成员得到的
`t`。其他库或局部同名函数不受影响。

## 按模式配置

显式 import 的 Vanilla 项目可以使用 `recommended`。启用 ai-i18n 按需导入时，选择与
Vite `framework` 一致的 preset；它会声明对应只读全局并启用同一条静态参数规则：

```js
import aiI18n from '@boses/eslint-plugin';

export default [
  ...aiI18n.configs.vanilla, // 或 .vue / .react
];
```

这些 preset 只负责 ai-i18n 的 `t`/`useI18n`。宿主 Auto Import 插件管理的其他 API 仍由
它自己的 ESLint 集成负责。

## Vue SFC

`.vue` 是可选文件格式。Vue 项目应先通过 `eslint-plugin-vue` 配置
`vue-eslint-parser`，再展开 `configs.vue`：

```js
import aiI18n from '@boses/eslint-plugin';
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

`configs.vue` 复用宿主的 Vue parser，只启用同一条 `t-static-args` 规则。语义分析使用
Vue 项目已有的 `@vue/compiler-sfc`，与 Vite 提取器共享编译结果和 source map，覆盖
`<script>`、`<script setup>`、模板插值和指令表达式。两个 Vue 依赖均为可选 peer，
不会安装到 React/Vanilla 项目。

Vue preset 同时覆盖 Vue JSX/TSX，但宿主仍需用 `@vitejs/plugin-vue-jsx` 编译这些文件。
React 项目使用 React preset；同一个 Vite build 不支持两种框架模式混用。

规则与 Vite 共用静态参数语义，包括 `i18n.t()`、`i18n['t']()` 和省略式
`t('source', undefined)`。未绑定到 ai-i18n 的 template-only `t()` 不参与检查。

需要解析 `tsconfig` 路径别名时，可以显式配置规则：

```js
import aiI18n from '@boses/eslint-plugin';

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
