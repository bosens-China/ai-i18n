---
title: defineI18nMessages()
description: 声明可被静态分析器枚举的消息集合
---

`defineI18nMessages()` 是全局编译宏，不是 `virtual:ai-i18n` 的 Runtime 导出，因此无需 import。

## 签名

```ts
function defineI18nMessages<T>(value: T): T;
```

## 用法

```ts
const messages = defineI18nMessages({
  save: '保存',
  states: ['等待中', '处理中', '已完成'],
});

t(messages.save);
t(messages.states[index]);
```

宏接受任意类型，并在 Vite 或 `aiI18nVitest()` 转换时消除为原参数。它不会冻结、拷贝或校验
对象；作用只是告诉静态分析器，这个对象或数组是可枚举的消息集合。

动态索引会提取集合中可以证明有限的候选值。函数调用、getter、`await` 等用户代码不会在分析
阶段执行。

## 限制

宏必须直接写成 `defineI18nMessages(value)`。不能将它赋值给别名、作为值传递，或在未经
`aiI18n()` / `aiI18nVitest()` 转换的 Node、Jest 环境中执行。

局部声明同名 `defineI18nMessages` 时，局部 binding 优先，不会被识别为编译宏。

插件生成的 `ai-i18n.d.ts` 会提供全局 TypeScript 声明。ESLint 的候选数量检查见
[ESLint](/guide/quality/eslint#static-candidate-limit-选项)。
