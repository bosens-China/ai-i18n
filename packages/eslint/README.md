# @ai-i18n/eslint-plugin

用于提前报告无法被 Vite/Yuku 静态提取、不符合推荐语法，或不会随语言切换刷新的 Runtime
用法。规则检查解析到 `virtual:ai-i18n` 的翻译与状态 API，以及 Vue/React 模式下
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

两个 Vue preset 都复用宿主的 Vue parser，并启用五条适用规则。语义分析使用
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

## 生命周期检查

静态提取成功不代表字符串会自动刷新。所有 preset 都启用
`ai-i18n/no-eager-translation`：在模块或 `<script setup>` 初始化期间保存 `t()` 结果会
收到 warning。Vue SFC 的 `export default { setup() {} }`，以及 `.vue` / `.ts` / `.tsx`
中从 `vue` 导入的 `defineComponent({ setup() {} })` 和函数签名也按一次性 setup
初始化检查。纯 Options `data()` 保存的译文同样只是初始化快照，规则会提示改用
`tComputed()` 或在 getter / method 执行时调用 `t()`。

```ts
// 以下各行是相互独立的示例
export const label = t('保存'); // warning：只保存初始化时的译文
export const getLabel = () => t('保存'); // 允许：每次调用重新读取当前语言
export const label = tRef('保存'); // Vue：允许，返回响应式 ComputedRef
export default { computed: { label: tComputed('保存') } }; // 纯 Options：允许
export default { data: () => ({ label: t('保存') }) }; // warning：Options data 快照
```

配置对象也要按生命周期选择写法。模块顶层直接保存图表或菜单配置会得到初始化快照；改成工厂函数，
并在首次渲染和语言变化后重新创建配置：

```ts
// warning
export const chartOptions = { title: { text: t('销量') } };

// 允许：调用时读取当前语言
export const createChartOptions = () => ({
  title: { text: t('销量') },
});
```

集中管理有限标题时，使用 `defineI18nMessages()` 声明静态集合，并在 getter 或普通函数执行时
调用 `t(ROUTE_TITLES[name])`。这样既能完整提取，也不会长期保存初始化译文。

第三方配置明确支持函数值时，可以把翻译放进该回调。例如 async-validator 的校验消息：

```ts
const rules = {
  password: {
    required: true,
    message: () => t('请输入旧密码'),
  },
};
```

规则只判断 `t()` 的执行位置，不会推断某个第三方字段是否接受函数。API 不支持延迟回调时，
使用工厂函数或框架提供的响应式 API；不要改回固定的源语言字面量。

`recommended`、`vue`、`vue-auto-import` 与 `react-auto-import` 还启用
`ai-i18n/no-unsubscribed-t`。Vue template、render 与 JSX / TSX 中的 Runtime `t` 会追踪
adapter revision，可以直接使用。React JSX / TSX 的组件渲染函数仍应从 `useI18n()` 获取
`t`；React Compiler 的 `"use memo"` 与 `"use no memo"` 都不会替代订阅。两个 Vue preset
还会报告 `this.t` 与 `this.$t`，避免 Vue template 类型桥让实例成员写法被误认为受支持；
Options script 应直接调用词法作用域中的 `t()`。

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
`getLang()` 或 `getLangLoadState()` 的初始化快照；普通 Vue `setup()` 与纯 Options
`data()` 也不能保存这些快照。Vue Composition API 使用 `useI18n()` 返回的状态，纯 Options
API 把 `...i18nComputed()` 直接展开到根 `computed`；setup、data、methods、render 与
template 中直接调用该工厂会提示错误位置。事件处理器、action、普通工具函数和即时 console
调用允许按需读取。规则只分析当前文件，不追踪跨文件 store 数据流。

六条规则可独立启用。四条静态分析规则无法启动时，同一文件只报告一次双语错误；官方 preset 由
`t-static-args` 优先报告，避免次级规则重复提示。

规则与 Vite 共用静态参数语义，包括从 `useI18n()` 获得的对象成员调用
`i18n.t()`、`i18n['t']()`、省略式 `t('source', undefined)` 和 tagged template。
整棵可静态求值的纯文案对象或数组可以直接传给 `t()`、Vue `tRef()` 或 `tComputed()`，不要求
`defineI18nMessages()` 或 `as const`；规则会按去重后的字符串叶子计算静态候选数。
Vue 模板可以直接调用显式导入或自动导入的 `t()`，包括只有 template 的 SFC。模板局部变量
和组件自身同名 binding 会遮挡自动导入，ESLint 与 Vite 使用相同判断。
在 template 或 JSX/TSX 渲染期间调用 `tRef()` 会重复创建 `computed`，同一规则会提示在
Vue setup 中只创建一次并使用返回的 Ref。`tComputed()` 只能直接作为纯 Options API 的
Vue 组件根对象 `computed` 属性值；普通模块对象与 `data` 中嵌套的同名对象不属于组件
computed。模块变量、`data/setup/methods`、template 与 render 中的调用都会提示改用对应的
`tRef()` 或 `t()`。反过来，纯 Options 的 `computed/data/methods` 不应创建 `tRef()`：
computed 使用 `tComputed()`，methods 在执行时调用 `t()`；`tRef()` 留给 setup/composable。

对象或数组的成员级引用只有在根集合由 `defineI18nMessages()` 标记后才属于推荐写法。
动态生成的树、非普通对象以及带第二参数的整树调用会报错。字符串拼接、
逻辑表达式、`let` 文案、普通集合成员、`const tr = t`、命名空间调用、二次 Hook 解构、
`useI18n().t()` 与 `require()` 都会报错。

## Monorepo 子包

被应用消费的本地源码子包不需要再次注册 `@ai-i18n/vite`。仓库根 ESLint 配置已经覆盖
`packages/**` 时，只在根配置引入一次与消费应用一致的 preset；子包拥有独立
`eslint.config.*` 或独立 lint 命令时，也必须引入该 preset，并确保
`@ai-i18n/eslint-plugin` 能从该配置解析到。

应用私有子包使用自动导入时，选择与消费它的 Vite build 相同的 `*-auto-import` preset，
并让子包 TypeScript 项目包含该 build 生成的 dts。会被多个应用复用的子包优先显式导入
`virtual:ai-i18n`，使用显式导入 preset，避免依赖单个应用的全局声明。

## alias、tsconfig 与 jsconfig

`settings['ai-i18n'].alias` 拥有最高解析优先级。纯 JavaScript 项目可以与 Vite 共享同一个
本地源码 alias 对象，无需为了 ESLint 额外创建 `tsconfig.json`：

```js
// aliases.js
import { fileURLToPath } from 'node:url';

export const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
};
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import { alias } from './aliases.js';

export default defineConfig({ resolve: { alias } });
```

```js
// eslint.config.js
import aiI18n from '@ai-i18n/eslint-plugin';
import { alias } from './aliases.js';

export default [
  ...aiI18n.configs.recommended,
  {
    settings: {
      'ai-i18n': { alias },
    },
  },
];
```

第一版只承诺字符串到字符串的对象形式。replacement 必须使用绝对路径，并指向项目本地源码。
Vite 的数组形式、正则 `find`、`customResolver` 与 resolver plugin 不在支持范围内。插件不会
加载或执行 `vite.config.*`。

显式 alias 未匹配当前导入时，静态分析规则从 importer 向上寻找最近的 `tsconfig.json` 或
`jsconfig.json`；同一目录同时存在两者时优先使用 `tsconfig.json`。插件解析 `extends`，
递归读取 `references`，再按 importer 是否满足各项目的 `files`、`include`、`exclude`
选择实际配置。因此常见的 `@/*` paths alias 不需要额外选项。Vue 文件必须由项目显式包含，
例如 `include: ['src/**/*.ts', 'src/**/*.vue']`。

`tsconfigPath` 是自动发现入口的可选覆盖项，适用于非标准配置名或希望固定从某个 solution
config 开始解析的项目。相对路径按 ESLint 进程的工作目录解析；指向带 `references` 的根
配置后，仍会执行相同的递归与项目选择逻辑。该选项沿用现有名称，也可以直接指向
`jsconfig.json`。

TypeScript 6 的编译器仍执行已有的 `baseUrl` 解析，但会报告弃用诊断；TypeScript 7 将
不再支持该选项。插件兼容 TypeScript 5/6 的 `baseUrl + paths`；新项目推荐省略
`baseUrl`，写成 `"paths": { "@/*": ["./src/*"] }`。若旧项目还依赖 `baseUrl` 的未匹配
bare import 查找，则用 `"*": ["./src/*"]` 显式保留。只存在于 Vite `resolve.alias`
的别名应通过共享对象传入 `settings['ai-i18n'].alias`。

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
        i18nComputed: 'readonly',
        tComputed: 'readonly',
        defineI18nMessages: 'readonly',
      },
    },
    plugins: { 'ai-i18n': aiI18n },
    rules: {
      'ai-i18n/no-eager-translation': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          framework: 'vue',
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-unsubscribed-t': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          framework: 'vue',
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
        },
      ],
      'ai-i18n/no-unsubscribed-runtime-state': [
        'warn',
        {
          autoImport: ['getLang', 'getLangLoadState', 'i18nComputed'],
          framework: 'vue',
        },
      ],
      'ai-i18n/static-candidate-limit': [
        'warn',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
          tsconfigPath: './tsconfig.json', // 可选：覆盖自动发现入口
          maxStaticCandidates: 2_000,
        },
      ],
      'ai-i18n/t-static-args': [
        'error',
        {
          autoImport: ['t', 'tRef', 'tComputed', 'useI18n'],
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
            'i18nComputed',
            'tComputed',
          ],
        },
      ],
    },
  },
];
```

上例匹配 Vue 模式；React 应移除 `tRef`、`i18nComputed` 与 `tComputed`，Vanilla 再移除
`useI18n`。翻译静态分析规则的 `autoImport` 只列 `t`、`tRef`、`tComputed` 与
`useI18n`，状态快照规则只列 `getLang` 与 `getLangLoadState`。日常接入优先使用预设，
避免 Vite 与 ESLint 的 API 集合不一致。

`ai-i18n/static-candidate-limit` 默认在单个 `t()` 的 source 与 options 组合超过 1000 个
时警告。`maxStaticCandidates` 必须是正整数，只改变 ESLint 的提示阈值；Vite 提取不设
上限，也没有对应插件选项。

插件不会自动修改宿主 ESLint 配置。

诊断默认按 Node 时区选择语言：`Asia/Shanghai` 与 `Asia/Urumqi` 使用中文，其他时区使用
英文。设置 `AI_I18N_DIAGNOSTIC_LOCALE=zh-CN` 或 `en-US` 可以固定语言，`auto` 恢复自动
检测。
