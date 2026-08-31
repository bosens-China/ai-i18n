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

集合可以放在独立 ESM 源码中导出，再通过相对路径、Vite alias 或 tsconfig paths 导入；无需为了
静态分析把集合移动到调用文件，也不需要在首次打开页面前手工预热依赖。

宏用于“先定义集合，再把其中某个成员交给 `t()`”的写法。如果需要一次翻译整棵纯文案对象
或数组，可以直接写 `t(messages)`；Vue setup 中可以写 `tRef(messages)`。这两种整树调用
不需要宏，也不要求 `as const`：

```ts
export const messages = {
  save: '保存',
  states: ['等待中', '处理中'],
};

const labels = t(messages);
```

宏接受任意类型。Vite 或 `aiI18nVitest()` 会把宏调用替换为原参数表达式，因此参数对象或数组仍然
存在，可以继续导出、索引或传给 `t()`。宏不会冻结、拷贝或校验对象；它只告诉静态分析器，这个
对象或数组是可枚举的消息集合。

动态索引会提取集合中可以证明有限的候选值。函数调用、getter、`await` 等用户代码不会在分析
阶段执行。

## 限制

宏必须直接写成 `defineI18nMessages(value)`。不能引用宏函数本身、将它赋值给别名或作为值传递，
也不能在未经
`aiI18n()` / `aiI18nVitest()` 转换的 Node、Jest 环境中执行。

局部声明同名 `defineI18nMessages` 时，局部 binding 优先，不会被识别为编译宏。

插件生成的 `ai-i18n.d.ts` 会提供全局 TypeScript 声明。ESLint 的候选数量检查见
[ESLint](/guide/quality/eslint#static-candidate-limit-选项)。
