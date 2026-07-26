---
title: Runtime API
description: virtual:ai-i18n 的函数签名、参数、返回值与框架差异
---

Runtime API 统一从 `virtual:ai-i18n` 导入。显式导入始终可用，不受 `autoImport` 影响。

```ts
import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n';
```

## API 可用范围

| API         | Vanilla | Vue | React | 按需导入    |
| ----------- | ------- | --- | ----- | ----------- |
| `t`         | 是      | 是  | 是    | 仅 Vanilla  |
| `setLang`   | 是      | 是  | 是    | 仅 Vanilla  |
| `getLang`   | 是      | 是  | 是    | 仅 Vanilla  |
| `getLangs`  | 是      | 是  | 是    | 仅 Vanilla  |
| `subscribe` | 是      | 是  | 是    | 仅 Vanilla  |
| `useI18n`   | 否      | 是  | 是    | Vue / React |

Vue 与 React 业务组件推荐使用 `useI18n()`，以便框架自动响应语言变化。

## `defineI18nMessages(value)`

`defineI18nMessages()` 是编译宏，不是 `virtual:ai-i18n` 的 Runtime 导出，因此无需 import：

```ts
const messages = defineI18nMessages({
  save: '保存',
  states: ['等待中', '处理中', '已完成'],
});

t(messages.save);
t(messages.states[index]);
```

它接受任意类型，并在 Vite 或 `aiI18nVitest()` 转换时消除为原参数。它不会冻结、拷贝或校验
对象；作用只是明确告诉静态分析器：这个对象或数组是可枚举的消息集合。动态索引会提取集合中
可证明有限的候选值，函数调用、getter、`await` 等用户代码仍不会在分析阶段执行。Vite
不会限制静态候选数量；ESLint 默认在单个表达式超过 1000 个候选时给出可配置警告，详见
[ESLint](/guide/basic/eslint)。

宏必须直接写成 `defineI18nMessages(value)`，不能赋值给别名、作为值传递或脱离
`aiI18n()` / `aiI18nVitest()` 处理的 Vite 模块运行；否则插件会报错，或在未经过 Vite
转换的 Node、Jest 等环境中成为不存在的运行时全局。

插件生成的 `ai-i18n.d.ts` 会声明宏的全局 TypeScript 类型。局部声明同名
`defineI18nMessages` 时，局部 binding 优先，不会被当作宏处理。

## `t(source, options?)` 与 `` t`...` ``

```ts
interface TranslationOptions {
  id?: string;
  comment?: string;
}

function t(source: string, options?: TranslationOptions): string;
function t(strings: TemplateStringsArray, ...values: unknown[]): string;
```

| 参数      | 类型                 | 必填 | 默认值      | 作用                             |
| --------- | -------------------- | ---- | ----------- | -------------------------------- |
| `source`  | `string`             | 是   | 无          | 源文案，也是翻译缺失时的回退值。 |
| `options` | `TranslationOptions` | 否   | `undefined` | 指定稳定 ID 或翻译注释。         |

日常文案只需 `t(source)`。需要翻译语境或显式 ID 时传入 options 对象。source 与 options
必须能在构建期静态求值。

```ts
t('保存');
t('保存', { comment: '按钮' });
t('提交', { id: 'git.commit', comment: '创建 Git 提交' });
```

未指定 `id` 时，message ID 就是 `source`，同一 source 的调用共享译文。显式 ID 用来拆分
同一句原文的不同语义，例如普通表单中的“提交”和 Git 场景中的“提交”。ID 会去除首尾空白，
且不能为空；同一 ID 不得指向不同原文。`comment` 只提供给翻译模型，不参与默认 ID。
TypeScript 会检查 options 的字段名以及 `id`、`comment` 类型；Analyzer、ESLint 和 Vite
构建检查静态可提取性、空 ID 与 ID 冲突。浏览器 Runtime 不再重复校验这些输入。

动态值使用 tagged template。表达式不会交给翻译模型，内部会变成 `{{0}}`、`{{1}}` 等占位符；
译文可以调整占位符顺序，运行时再填入值：

```ts
t`你好 ${user.name}，你有 ${unreadCount} 条消息`;
```

源码中原样出现的编号标记会自动转义。例如 `` t`写法 {{0}}，值为 ${value}` `` 在协议文件中
表示为 `写法 {{=0}}，值为 {{0}}`：带等号的标记是字面文本，不带等号的标记才是运行时值。
转义只存在于内部协议，最终仍显示为 `{{0}}`。

Runtime 替换动态值前会比较源文与译文的占位符。占位符缺失、多出或编号改变时，
`console.warn` 会报告 locale 与 message ID，但 Runtime 仍继续使用该译文；该问题不会抛错，
也不会自动回退到源文。

## `setLang(value)`

```ts
function setLang(value: string): Promise<void>;
```

`value` 为必填参数，必须匹配 `locales[].value`。不支持的值会抛出 `RangeError`。
语言发生变化后，Runtime 会通知订阅者。配置 `persist` 后，切换成功的语言会写入
localStorage。

:::warning 不要长期保存译后字符串
`setError(t('请求失败'))` 一类已经写入 state、storage、请求体或文件元数据的字符串不会因
后续切换语言自动变化。持久数据和业务判断应保存稳定的语义 code、序号或 message 标识，
在展示层调用 `t`。不要用译文做文件匹配、正则解析或稳定 ID；即时 toast 已经显示后保持
原语言通常是合理的。
:::

## `getLang()`

```ts
function getLang(): string;
```

返回当前语言的 `value`。首次加载按“有效持久化值 → `defaultLang`”选择；
按 locale 懒加载时，目标语言资源就绪前暂时返回 `sourceLang`。

## `getLangs()`

```ts
function getLangs(): readonly LangOption[];
```

返回配置的语言列表快照。每一项都包含必填的 `value` 与 `label`；修改返回值不会影响
Runtime 的内部配置。

## `subscribe(listener)`

```ts
function subscribe(listener: () => void): () => void;
```

`listener` 为必填参数。语言变化或 Runtime 模块更新时会执行回调。返回值是取消订阅函数。

```ts
const unsubscribe = subscribe(render);
unsubscribe();
```

## `useI18n()`

Vue 与 React 模式额外导出 `useI18n()`：

```ts
const { t, setLang, currentLang, langs } = useI18n();
```

| 返回字段      | Vue                   | React                   | 作用             |
| ------------- | --------------------- | ----------------------- | ---------------- |
| `t`           | 响应式函数            | Hook 订阅后的函数       | 翻译源文案。     |
| `setLang`     | 函数                  | 函数                    | 切换语言。       |
| `currentLang` | `ComputedRef<string>` | `string`                | 当前语言。       |
| `langs`       | 只读 `ShallowRef`     | `readonly LangOption[]` | 支持的语言列表。 |

`useI18n()` 没有参数，也没有可配置默认值。React 中必须遵守 Hook 调用规则；Vue 中建议在
`<script setup>` 或 `setup()` 内调用。
