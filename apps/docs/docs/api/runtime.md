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

## `t(source, comment?)`

```ts
function t(source: string, comment?: string): string;
```

| 参数      | 类型     | 必填 | 默认值      | 作用                             |
| --------- | -------- | ---- | ----------- | -------------------------------- |
| `source`  | `string` | 是   | 无          | 源文案，也是翻译缺失时的回退值。 |
| `comment` | `string` | 否   | `undefined` | 消歧注释，会参与 message ID。    |

两个参数都必须能在构建期静态求值。相同 `source` 配合不同 `comment` 会生成不同消息。

```ts
t('保存', '按钮');
t('保存', '草稿状态');
```

## `setLang(value)`

```ts
function setLang(value: string): Promise<void>;
```

`value` 为必填参数，必须匹配 `locales[].value`。不支持的值会抛出 `RangeError`。
语言发生变化后，Runtime 会通知订阅者；当前实现不会自动写入 localStorage。

## `getLang()`

```ts
function getLang(): string;
```

返回当前语言的 `value`。首次加载时等于 `defaultLang`。

## `getLangs()`

```ts
function getLangs(): readonly LangOption[];
```

返回配置的语言列表。每一项都包含必填的 `value` 与 `label`。

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
