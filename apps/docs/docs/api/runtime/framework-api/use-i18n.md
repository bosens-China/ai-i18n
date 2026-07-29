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
  langLoadState: ComputedRef<LangLoadState>;
  isLangLoading: ComputedRef<boolean>;
  langLoadError: ComputedRef<unknown | null>;
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
  langLoadState: LangLoadState;
  isLangLoading: boolean;
  langLoadError: unknown | null;
}

type UseI18n = () => ReactI18n;
```

`useI18n()` 没有参数。

## 返回值

| 字段            | Vue                            | React                   | 作用                         |
| --------------- | ------------------------------ | ----------------------- | ---------------------------- |
| `t`             | 响应式函数                     | Hook 订阅后的函数       | 翻译文案。                   |
| `setLang`       | 函数                           | 函数                    | 切换语言。                   |
| `currentLang`   | `ComputedRef<string>`          | `string`                | 当前语言。                   |
| `langs`         | 只读 `ShallowRef`              | `readonly LangOption[]` | 支持的语言列表。             |
| `langLoadState` | `ComputedRef<LangLoadState>`   | `LangLoadState`         | 完整加载状态快照。           |
| `isLangLoading` | `ComputedRef<boolean>`         | `boolean`               | 是否正在加载目标语言。       |
| `langLoadError` | `ComputedRef<unknown \| null>` | `unknown \| null`       | 最近一次有效切换的加载错误。 |

`langLoadError` 保留 loader reject 的原始值，因此类型是 `unknown`，也可能是
`undefined`、`null`、空字符串等 falsy 值。判断是否失败必须使用
`langLoadState.status === 'error'`；`langLoadError` 只用于读取详情，展示前应转换为应用
自己的用户文案。下一次有效切换开始或加载成功后会清除它。完整三态见
[`getLangLoadState()`](/api/runtime/functions/get-lang-load-state)。

## Vue

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { currentLang, langs, setLang, t, isLangLoading, langLoadState } =
  useI18n();

async function switchLanguage() {
  try {
    await setLang('en-US');
  } catch {
    // 通用错误 UI 读取共享状态；这里终结 rejected Promise。
  }
}
</script>

<template>
  <button :disabled="isLangLoading" @click="switchLanguage">
    {{ isLangLoading ? t('正在加载语言包…') : t('切换语言') }}
  </button>
  <p v-if="langLoadState.status === 'error'">
    {{ t('语言包加载失败，请重试') }}
  </p>
</template>
```

建议在 `<script setup>` 或 `setup()` 中调用。

## React

```tsx
import { useI18n } from 'virtual:ai-i18n';

export function LanguagePicker() {
  const { isLangLoading, langLoadState, setLang, t } = useI18n();

  async function switchLanguage() {
    try {
      await setLang('en-US');
    } catch {
      // 通用错误 UI 读取共享状态；这里终结 rejected Promise。
    }
  }

  return (
    <>
      <button disabled={isLangLoading} onClick={() => void switchLanguage()}>
        {isLangLoading ? t('正在加载语言包…') : t('切换语言')}
      </button>
      {langLoadState.status === 'error' ? (
        <p>{t('语言包加载失败，请重试')}</p>
      ) : null}
    </>
  );
}
```

React 中必须遵守 Hook 调用规则。

React adapter 使用 `useSyncExternalStore` 订阅 Runtime revision。revision 改变时，Hook
返回的 `t` 也会获得新的函数引用，因此 React Compiler 可以使依赖该引用的缓存失效。直接
导入 Runtime 顶层 `t` 没有这个订阅边界；`"use memo"` 或 `"use no memo"` 都不能替代
`useI18n()`。
