# @ai-i18n/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取、内嵌静态 markup、不符合推荐语法，或不会随语言
切换刷新的 Runtime 用法。规则检查解析到 `virtual:ai-i18n` 的翻译与状态 API，以及 Vue/React 模式下
`useI18n()` 返回的订阅状态。其他库或局部同名函数不受影响。

alpha 阶段请安装 `@ai-i18n/eslint-plugin@alpha`；peer 支持 ESLint 9 和 10。

官方 preset 与 Vite 源码范围一致，覆盖 `.js`、`.mjs`、`.ts`、`.mts` 以及当前框架支持的
`.jsx`、`.tsx`、`.vue`。它们会排除 `.cjs` 与 `.cts`，也不会为这些文件声明自动导入全局。

## 按模式配置

显式 import 时，Vanilla / React 使用 `recommended`，Vue 使用覆盖 SFC 的 `vue`：

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [
  ...aiI18n.configs.recommended, // Vue 改用 .vue
];
```

启用 `aiI18n({ autoImport: true })` 时，改用与 Vite 框架模式一致的自动导入 preset：

```js
export default [
  ...aiI18n.configs['vanilla-auto-import'],
  // Vue：...aiI18n.configs['vue-auto-import']
  // React：...aiI18n.configs['react-auto-import']
];
```

只有 `*-auto-import` preset 会声明 Runtime 全局。所有 preset 都声明只读的
`defineI18nMessages` 编译宏。

希望在自动导入模式中禁止残留的同名显式 import 时，可以按需启用：

```js
export default [
  ...aiI18n.configs['vue-auto-import'],
  {
    rules: {
      'ai-i18n/no-redundant-auto-import': [
        'warn',
        {
          autoImport: [
            'useI18n',
            't',
            'setLang',
            'getLang',
            'getLangs',
            'getLangLoadState',
            'subscribe',
            'tRef',
            'i18nComputed',
            'tComputed',
          ],
        },
      ],
    },
  },
];
```

React 使用上面的完整列表并移除 `tRef`、`i18nComputed` 与 `tComputed`；Vanilla 再移除
`useI18n`。该规则不在 preset 中默认启用。它只检查来自 `virtual:ai-i18n` 的未改名值导入，
保留改名导入、namespace import、type import 和当前模式不会自动注入的 API，并支持
`eslint --fix`。import 内部有注释时只报告，不自动修改。

## Vue SFC

`.vue` 是可选文件格式。Vue 项目应先通过 `eslint-plugin-vue` 配置
`vue-eslint-parser`，再按 Vite 的 `autoImport` 值选择 preset：

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
  ...aiI18n.configs.vue, // autoImport: false
  // ...aiI18n.configs['vue-auto-import'], // autoImport: true
];
```

两个 Vue preset 都复用宿主的 Vue parser，并启用六条适用规则。语义分析使用
Vue 项目已有的 `vue/compiler-sfc` Node 入口，与 Vite 提取器复用相同分析语义和
source-map 映射，覆盖 `<script>`、`<script setup>`、模板插值和指令表达式。Vue、
TypeScript 与 SFC 编译相关依赖均为可选 peer，不会安装到 React/Vanilla 项目。

Vue SFC 可在 `<script>`、`<script setup>`、Options API 的 `computed` / `methods` 与
template 中直接调用 Runtime `t`。显式导入和自动导入都支持；自动导入只处理未绑定且未被
模板局部变量或组件自身 prop、data、computed、普通同名 method、inject、setup 返回值遮挡的
`t`。自动导入模式下，纯 Options template 不需要 `methods: { t }`；关闭自动导入时，普通
Options `<script>` 仍需通过真实 method binding 把显式导入的 Runtime 函数暴露给 template。

纯 Options API 可在 `computed` 中展开 `...i18nComputed()` 获得响应式语言和加载状态，
并把 `tComputed()` 直接写成 computed 属性值。`watch.currentLang` 可使用 Vue 原生 watcher
监听语言变化：

```ts
import { defineComponent } from 'vue';
import { i18nComputed, t, tComputed } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    ...i18nComputed(),
    saveLabel: tComputed('保存'),
  },
  methods: {
    t, // 让 Volar 与 template 都能识别 t()
    notify() {
      return t('保存成功'); // script 内继续使用 lexical t
    },
  },
  watch: {
    currentLang(next: string, previous: string) {
      console.log(previous, next);
    },
  },
});
```

使用 `defineComponent()` 后，`this.currentLang` 等展开后的 computed 字段可被 IDE 准确推断。
Vue 3.5 的 Options `watch` 回调参数不会按 key 推断，TypeScript 项目应显式标注
`next` / `previous`。

上例展示关闭自动导入时的显式 import。开启 `autoImport` 后，应同时删除 ai-i18n import 和
`methods: { t }`，script 与 template 直接使用裸 `t()`；本地 `t() {}` 或本地变量仍然
遮挡。显式模式的改名导入可写成 `methods: { t: translate }`，只有能证明值来自
`virtual:ai-i18n` 的 bridge 才参与 template 提取。两种模式都不支持 script 内的
`this.t()`、`this.$t()`、mixin 与 `globalProperties`。

Vue preset 同时覆盖 Vue JSX/TSX，但宿主仍需用 `@vitejs/plugin-vue-jsx` 编译这些文件。
同一个 Vite build 不支持两种框架模式混用。

## 更多配置与规则

- [译文生命周期与静态规则](./docs/lifecycle.md)
- [Monorepo 子包、alias、tsconfig 与 jsconfig](./docs/project-resolution.md)
