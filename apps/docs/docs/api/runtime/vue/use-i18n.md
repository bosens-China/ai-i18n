---
title: Vue useI18n()
description: 在 Vue 组件中订阅 Runtime，并响应语言和语言包状态变化
---

Vue 模式从 `virtual:ai-i18n` 导出 `useI18n()`：

```ts
import { useI18n } from 'virtual:ai-i18n';
```

## 签名

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

`useI18n()` 没有参数。

## 返回值

| 字段            | 类型                                              | 作用                              |
| --------------- | ------------------------------------------------- | --------------------------------- |
| `t`             | `I18nRuntime['t']`                                | 翻译文案，并追踪 Runtime revision |
| `setLang`       | `I18nRuntime['setLang']`                          | 切换语言                          |
| `currentLang`   | `ComputedRef<string>`                             | 当前语言                          |
| `langs`         | `DeepReadonly<ShallowRef<readonly LangOption[]>>` | 支持的语言列表                    |
| `langLoadState` | `ComputedRef<LangLoadState>`                      | 完整加载状态快照                  |
| `isLangLoading` | `ComputedRef<boolean>`                            | 是否正在加载目标语言              |
| `langLoadError` | `ComputedRef<unknown \| null>`                    | 最近一次有效切换的加载错误        |

`langLoadError` 保留 loader reject 的原始值，因此类型是 `unknown`，也可能是
`undefined`、`null`、空字符串等 falsy 值。判断是否失败必须使用
`langLoadState.status === 'error'`。`langLoadError` 只用于读取详情，展示前应转换为应用
自己的用户文案。下一次有效切换开始或加载成功后会清除它。完整三态见
[`getLangLoadState()`](/api/runtime/functions/get-lang-load-state)。

## 解构 `t`

可以在 `<script setup>` 中解构 `t`，再直接在模板中调用：

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n';

const { t } = useI18n();
</script>

<template>
  <button>{{ t('保存') }}</button>
</template>
```

这里的 `t` 是函数，不是 Ref，因此不需要 `.value`。模板渲染时调用 `t()`，函数会读取
Vue 适配器内部的 Runtime revision。语言、加载状态或翻译模块更新后，revision 变化会触发
模板重新渲染。解构 `t` 不会切断这条依赖。

不要在 setup 阶段提前保存译后字符串：

```ts
const { t } = useI18n();
const label = t('保存'); // 只计算一次，不会随语言切换更新
```

需要在脚本中预先声明响应式展示值时，使用 [`tRef()`](./t-ref)：

```ts
import { tRef } from 'virtual:ai-i18n';

const label = tRef('保存');
```

`tRef` 是独立的 Vue API，不在 `useI18n()` 返回值中。对象或数组展示值也可以直接写
`const labels = tRef(messages)`，得到随语言变化更新的同形只读计算属性。

## 示例

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

建议在 `<script setup>` 或 `setup()` 中调用。静态提取规则见
[Vue 文案写法](/guide/basic/static-analysis/vue)。
