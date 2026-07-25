# Phase 6：静态消息集合宏与推荐语法

状态：Implemented，等待最终验收。

## 目标

在不执行用户代码的前提下，扩大 AST 对对象、数组和有限分支的提取能力；同时由 ESLint
收紧业务代码写法，避免“分析器能算出来”演变成难以维护的编码风格。

推荐写法：

```ts
const messages = defineI18nMessages({
  save: '保存',
  states: ['等待中', '处理中', '已完成'],
});

t(messages.save);
t(messages.states[index]);
```

`defineI18nMessages<T>(value)` 是 Vite 编译宏：

- 无需也不允许从 Runtime 导入；
- 构建时消除为带括号的原参数，运行时不增加函数、冻结、拷贝或校验；
- 接受任意 `T`，只承担“允许静态分析此集合”的意图标记；
- 只能直接调用，不能赋值、传递或作为运行时值使用；
- 本地同名 binding 会遮蔽宏；
- `aiI18n()` 的客户端、SSR transform 与 `aiI18nVitest()` 使用同一消除规则；
- 生成的 `ai-i18n.d.ts` 在所有框架模式下声明只读全局类型。

## 提取与合规是两个维度

| 写法                                        | Vite 提取            | ESLint       |
| ------------------------------------------- | -------------------- | ------------ |
| `t('保存')`                                 | 提取                 | 允许         |
| `const label = '保存'; t(label)`            | 提取                 | 允许         |
| `t(ok ? '保存' : '取消')`                   | 提取两项             | 允许         |
| `` t`你好 ${name}` ``                       | 提取编号模板         | 允许         |
| `t(messages.states[index])`，集合已用宏标记 | 提取有限候选         | 允许         |
| `t('保' + '存')`                            | 尽力提取             | 报错         |
| `t(ok && '保存')`                           | 尽力提取             | 报错         |
| `let label = '保存'; t(label)`              | 未发生写入时尽力提取 | 报错         |
| 普通对象或数组成员传给 `t`                  | 尽力提取             | 报错并建议宏 |

宏集合支持嵌套对象、数组、静态计算属性、静态 spread、固定索引和动态索引。动态索引只枚举
AST 中可证明有限的候选，不执行函数、getter、`await`、`JSON.parse` 或其他用户代码。
静态候选组合上限为 1000；超过上限按动态参数处理。

## 推荐的调用来源

允许：

- `import { t } from 'virtual:ai-i18n'`，包括 import 位置的别名；
- `const { t } = useI18n()`，包括解构位置的别名；
- `const i18n = useI18n(); i18n.t()` 与 `i18n['t']()`。

ESLint 拒绝：

- `const tr = t` 之类的二次赋值；
- `import * as i18n` 后调用 `i18n.t()`；
- 对 Hook 结果二次解构；
- `useI18n().t()`；
- CommonJS `require()`。

## 非目标

- 不提供运行时 identity helper 或对象不可变保证；
- 不执行任意用户代码以求值；
- 不把普通 UI 字符串自动视为翻译；
- 不为不推荐语法增加配置开关。
