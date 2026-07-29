# Phase 12：静态文案树翻译

状态：Passed。

## 背景

对象或数组形式的 UI 文案在 Vue 和 React 项目中很常见。此前只能用
`defineI18nMessages()` 标记集合后逐项调用 `t()`；Vue setup 若需要整组响应式译文，还要为
每个成员分别创建 `tRef()`。本阶段为整棵纯文案树提供一次调用、保持结构的翻译能力。

## Runtime 与类型契约

- `t<T extends MessageTree>(messages: T): TranslatedMessageTree<T>` 返回当前语言的同形快照。
- Vue `tRef<T extends MessageTree>(messages: T)` 返回同形只读 `ComputedRef`，语言或 Runtime
  revision 变化时重算。
- 每个字符串叶子独立翻译；数字、布尔值、`bigint`、`null` 与 `undefined` 原样保留。
- 返回新对象或数组，不修改输入。
- Runtime 拒绝 `Map`、`Set`、类实例、函数、循环引用等非普通文案树，并输出中英文错误。
- 普通字符串、options 与 tagged template 的既有签名保持不变。

## 静态提取与推荐语法

- 整棵本地或导入的静态 `const` 对象或数组可以直接传给 `t()` / `tRef()`。
- 整树调用本身就是提取边界，不需要 `defineI18nMessages()`，也不要求 `as const`。
- 所有字符串叶子进入提取结果；ESLint 候选上限按去重后的字符串叶子计算。
- `t(messages.save)`、`t(messages.states[index])` 等成员级调用仍要求根集合由
  `defineI18nMessages()` 标记。
- 整树调用只接受一个参数，不支持逐叶 `comment` 或 tagged template 插值。
- 文案树是 message-only 结构；路由、业务 key 等不应翻译的字符串不得混入。

## 框架行为

- React 组件从 `useI18n()` 获取 `t` 并在 render 中调用 `t(messages)`；Runtime revision
  变化触发重渲染和新的树快照。
- Vue setup / composable 使用 `tRef(messages)` 创建一次响应式文案树；模板自动解包。
- Vanilla 或框架外普通模块的 `t(messages)` 是调用时快照，应在 render、getter 或事件时
  重新求值。

## 协议与非目标

- 每个唯一字符串叶子继续生成既有 message ID；MCP schema、六个工具和协议文件格式不变。
- 不支持动态生成树、getter 求值、逐叶 options、树内 tagged template、Map/Set 或响应式树
  输入。
- 不改变 `defineI18nMessages()` 的成员候选枚举职责。
