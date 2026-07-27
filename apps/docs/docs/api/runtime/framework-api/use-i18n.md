---
title: useI18n()
description: 在 Vue 或 React 组件中响应语言变化
---

Vue 和 React 模式从 `virtual:ai-i18n` 导出 `useI18n()`：

```ts
import { useI18n } from 'virtual:ai-i18n';
```

Vanilla 模式不提供该函数。

## 签名

Vue 模式：

```ts
interface VueI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: ComputedRef<string>;
  langs: DeepReadonly<ShallowRef<readonly LangOption[]>>;
}

type UseI18n = () => VueI18n;
```

React 模式：

```ts
interface ReactI18n {
  t: I18nRuntime['t'];
  setLang: I18nRuntime['setLang'];
  currentLang: string;
  langs: readonly LangOption[];
}

type UseI18n = () => ReactI18n;
```

`useI18n()` 没有参数。

## 返回值

| 字段          | Vue                   | React                   | 作用             |
| ------------- | --------------------- | ----------------------- | ---------------- |
| `t`           | 响应式函数            | Hook 订阅后的函数       | 翻译文案。       |
| `setLang`     | 函数                  | 函数                    | 切换语言。       |
| `currentLang` | `ComputedRef<string>` | `string`                | 当前语言。       |
| `langs`       | 只读 `ShallowRef`     | `readonly LangOption[]` | 支持的语言列表。 |

## Vue

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { currentLang, langs, setLang, t } = useI18n();
</script>
```

建议在 `<script setup>` 或 `setup()` 中调用。

## React

```tsx
import { useI18n } from 'virtual:ai-i18n';

export function LanguagePicker() {
  const { currentLang, langs, setLang, t } = useI18n();

  return <button onClick={() => setLang('en-US')}>{t('切换语言')}</button>;
}
```

React 中必须遵守 Hook 调用规则。
