# Phase 11：Vue `tRef()` 响应式翻译语法糖

状态：Passed。

## 背景

Vue 模板中调用 `useI18n()` 返回的 `t` 会在渲染时读取 Runtime revision，因此语言切换后能
刷新。setup 中直接保存 `const label = t('保存')` 得到的却是字符串快照。要求每个脚本展示值
都手写 `computed(() => t('保存'))` 会增加重复样板。

## 契约

- Vue 模式的 `virtual:ai-i18n` 新增独立导出 `tRef()`；不放入 `useI18n()` 返回值。
- React 与 Vanilla 模式不导出、不自动导入，也不生成 `tRef` 类型。
- `tRef()` 返回只读 `ComputedRef<string>`，source/options 与 tagged template 的静态提取
  规则和 `t()` 一致。
- 语言或 Runtime 翻译模块变化时重新计算。tagged template 插值中的 Vue Ref 在 computed
  内解包，因此插值变化也会更新。
- `t()` 签名和返回值保持不变，始终返回字符串。

## 推荐生命周期

- Vue template 或渲染函数当场展示：使用 `useI18n()` 返回的 `t`。
- setup / composable 需要预先声明响应式展示值：调用一次 `tRef()`。
- 普通函数、事件或日志需要即时字符串：使用 `t()`。
- 不允许在 template 或 JSX / TSX 渲染期间调用 `tRef()`，避免每次渲染创建新的 computed。

## 工具链

- Vue 自动导入、生成声明和 Vitest 内存 Runtime 包含 `tRef`。
- Analyzer 将调用来源标记为 `vue-ref`，并按 `t()` 相同规则提取。
- `no-eager-translation` 接受 `tRef()` 的初始化赋值。
- `no-unsubscribed-t` 对渲染期间创建 `tRef()` 发出中英文 warning。
- Vue 自动导入 ESLint preset 声明 `tRef`；React / Vanilla preset 保持不变。

## 非目标

- 不把 `t()` 改成 Ref 或条件返回类型。
- 不给 React / Vanilla 增加同名 API。
- 不改变 MCP 工具 schema、协议文件或 message ID。
- 不为 `tRef()` 增加 `.ref` 等函数属性形式。
