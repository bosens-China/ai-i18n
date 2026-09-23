# 译文生命周期与静态规则

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

七条规则可独立启用。五条静态分析规则无法启动时，同一文件只报告一次双语错误；官方 preset 由
`t-static-args` 优先报告，避免次级规则重复提示。

`ai-i18n/no-embedded-markup` 是 Vanilla、Vue 和 React 共用的 warning。它检查 Analyzer
最终提取的 source，因此覆盖直接字符串、tagged template、静态 `const`、条件候选和文案树。
静态 HTML/SVG 应留在翻译调用外，或作为占位符传入。规则不限制文案长度、行数或占位符数量，
也不提供自动修复。

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
