# @ai-i18n/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取、不符合推荐语法，或不会随语言切换刷新的 Runtime
用法。规则检查解析到 `virtual:ai-i18n` 的翻译与状态 API，以及 Vue/React 模式下
`useI18n()` 返回的订阅状态。其他库或局部同名函数不受影响。

alpha 阶段请安装 `@ai-i18n/eslint-plugin@alpha`；peer 支持 ESLint 9 和 10。

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
          ],
        },
      ],
    },
  },
];
```

React 使用上面的完整列表并移除 `tRef`；Vanilla 再移除 `useI18n`。该规则不在 preset 中
默认启用。它只检查来自 `virtual:ai-i18n` 的未改名值导入，保留改名导入、namespace import、
type import 和当前模式不会自动注入的 API，并支持 `eslint --fix`。import 内部有注释时只
报告，不自动修改。

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

两个 Vue preset 都复用宿主的 Vue parser，并启用五条适用规则。语义分析使用
Vue 项目已有的 `vue/compiler-sfc` Node 入口，与 Vite 提取器复用相同分析语义和
source-map 映射，覆盖 `<script>`、`<script setup>`、模板插值和指令表达式。Vue、
TypeScript 与 SFC 编译相关依赖均为可选 peer，不会安装到 React/Vanilla 项目。

Vue preset 同时覆盖 Vue JSX/TSX，但宿主仍需用 `@vitejs/plugin-vue-jsx` 编译这些文件。
同一个 Vite build 不支持两种框架模式混用。

## 生命周期检查

静态提取成功不代表字符串会自动刷新。所有 preset 都启用
`ai-i18n/no-eager-translation`：在模块或 `<script setup>` 初始化期间保存 `t()` 结果会
收到 warning。Vue SFC 的 `export default { setup() {} }`，以及 `.vue` / `.ts` / `.tsx`
中从 `vue` 导入的 `defineComponent({ setup() {} })` 和函数签名也按一次性 setup
初始化检查。

```ts
export const label = t('保存'); // warning：只保存初始化时的译文
export const getLabel = () => t('保存'); // 允许：每次调用重新读取当前语言
export const label = tRef('保存'); // Vue：允许，返回响应式 ComputedRef
```

`recommended`、`vue`、`vue-auto-import` 与 `react-auto-import` 还启用
`ai-i18n/no-unsubscribed-t`。Vue / React JSX 或 TSX 的组件渲染函数不能只调用 Runtime
顶层 `t`，应从 `useI18n()` 获取 `t` 来建立框架订阅。React Compiler 的 `"use memo"`
与 `"use no memo"` 都不会替代订阅。

```tsx
function SaveButton() {
  return <button>{t('保存')}</button>; // warning
}

function SaveButton() {
  const { t } = useI18n();
  return <button>{t('保存')}</button>; // 允许
}
```

事件回调和普通延迟函数中的 Runtime `t` 允许，独立的 `console.log` / `warn` / `error` /
`info` / `debug` 调用也视为即时消费。其他未知调用仍会 warning。第一版不追踪跨函数、
跨文件或 `useMemo` / `useState` 等任意数据流，因此规则提示的是可以确定的常见问题，
不代表覆盖所有译文生命周期错误。

所有 preset 还启用 `ai-i18n/no-unsubscribed-runtime-state`。模块顶层不能缓存
`getLang()` 或 `getLangLoadState()` 的初始化快照；Vue template 与 JSX/TSX 渲染路径应使用
`useI18n()` 返回的 `currentLang` 或 `langLoadState`。事件处理器、action、普通工具函数和
即时 console 调用允许按需读取。规则只分析当前文件，不追踪跨文件 store 数据流。

六条规则可独立启用。四条静态分析规则无法启动时，同一文件只报告一次双语错误；官方 preset 由
`t-static-args` 优先报告，避免次级规则重复提示。

规则与 Vite 共用静态参数语义，包括从 `useI18n()` 获得的对象成员调用
`i18n.t()`、`i18n['t']()`、省略式 `t('source', undefined)` 和 tagged template。
整棵可静态求值的纯文案对象或数组可以直接传给 `t()` 或 Vue `tRef()`，不要求
`defineI18nMessages()` 或 `as const`；规则会按去重后的字符串叶子计算静态候选数。
Vue 模板必须在 `<script setup>` 中绑定 `useI18n()` 返回的 `t`；自动导入只省略 import，
不会自动合成 Hook。`vue-auto-import` 会把裸 template-only `t()` 作为 error；模板中已
绑定到 Runtime 顶层 `t` 的调用则由 `no-unsubscribed-t` warning。
在 template 或 JSX/TSX 渲染期间调用 `tRef()` 会重复创建 `computed`，同一规则会提示在
Vue setup 中只创建一次并使用返回的 Ref。

对象或数组的成员级引用只有在根集合由 `defineI18nMessages()` 标记后才属于推荐写法。
动态生成的树、非普通对象以及带第二参数的整树调用会报错。字符串拼接、
逻辑表达式、`let` 文案、普通集合成员、`const tr = t`、命名空间调用、二次 Hook 解构、
`useI18n().t()` 与 `require()` 都会报错。

## tsconfig 自动发现与路径别名

静态分析规则默认从当前文件向上寻找最近的 `tsconfig.json`，解析 `extends`，递归读取
`references`，再按 importer 是否满足各项目的 `files`、`include`、`exclude` 选择实际
配置。因此常见的 `@/*` TypeScript path alias 不需要额外选项。Vue 文件必须由项目显式
包含，例如 `include: ['src/**/*.ts', 'src/**/*.vue']`。

`tsconfigPath` 是自动发现入口的可选覆盖项，适用于非标准配置名或希望固定从某个 solution
config 开始解析的项目。相对路径按 ESLint 进程的工作目录解析；指向带 `references` 的根
配置后，仍会执行相同的递归与项目选择逻辑。

TypeScript 6 的编译器仍执行已有的 `baseUrl` 解析，但会报告弃用诊断；TypeScript 7 将
不再支持该选项。插件兼容 TypeScript 5/6 的 `baseUrl + paths`；新项目推荐省略
`baseUrl`，写成 `"paths": { "@/*": ["./src/*"] }`。若旧项目还依赖 `baseUrl` 的未匹配
bare import 查找，则用 `"*": ["./src/*"]` 显式保留。只存在于 Vite `resolve.alias`、
未同步到 tsconfig `paths` 的 alias 不属于 ESLint 的 TypeScript 配置。

需要覆盖自动发现入口时，可以显式配置规则：

```js
import aiI18n from '@ai-i18n/eslint-plugin';

export default [
  {
    languageOptions: {
      globals: {
        t: 'readonly',
        setLang: 'readonly',
        getLang: 'readonly',
        getLangs: 'readonly',
        getLangLoadState: 'readonly',
        subscribe: 'readonly',
        useI18n: 'readonly',
        tRef: 'readonly',
        defineI18nMessages: 'readonly',
      },
    },
    plugins: { 'ai-i18n': aiI18n },
    rules: {
      'ai-i18n/no-eager-translation': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-unsubscribed-t': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-unsubscribed-runtime-state': [
        'warn',
        { autoImport: ['getLang', 'getLangLoadState'] },
      ],
      'ai-i18n/static-candidate-limit': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
          maxStaticCandidates: 2_000,
        },
      ],
      'ai-i18n/t-static-args': [
        'error',
        {
          autoImport: ['t', 'tRef', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
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
          ],
        },
      ],
    },
  },
];
```

上例匹配 Vue 模式；React 应移除 `tRef`，Vanilla 再移除 `useI18n`。翻译静态分析规则的
`autoImport` 仍只列 `t`、`tRef` 与 `useI18n`，状态快照规则只列 `getLang` 与
`getLangLoadState`。日常接入优先使用预设，避免 Vite 与 ESLint 的 API 集合不一致。

`ai-i18n/static-candidate-limit` 默认在单个 `t()` 的 source 与 options 组合超过 1000 个
时警告。`maxStaticCandidates` 必须是正整数，只改变 ESLint 的提示阈值；Vite 提取不设
上限，也没有对应插件选项。

插件不会自动修改宿主 ESLint 配置。

诊断默认按 Node 时区选择语言：`Asia/Shanghai` 与 `Asia/Urumqi` 使用中文，其他时区使用
英文。设置 `AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定语言，`auto` 恢复自动
检测。
