# Vue integration

Reuse the existing `@vitejs/plugin-vue` and `@vue/compiler-sfc`; do not install a separate ai-i18n Vue
package. Let ai-i18n detect Vue from the final Vite plugin list. Set `framework: 'vue'` only when a
custom plugin setup cannot be detected.

Use Composition API with `<script setup lang="ts">`:

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n'

const { currentLang, langs, setLang, t } = useI18n()

async function switchLanguage(value: string) {
  await setLang(value)
}
</script>

<template>
  <p>{{ t('保存') }}</p>
  <select :value="currentLang" @change="switchLanguage(($event.target as HTMLSelectElement).value)">
    <option v-for="lang in langs" :key="lang.value" :value="lang.value">
      {{ lang.label }}
    </option>
  </select>
</template>
```

Use `t(source)` for ordinary copy, a tagged template for dynamic values, and `comment` only when
translation context matters:

```ts
t('保存', { comment: '工具栏按钮' })
t`已加入 ${name}`
```

In component templates and render functions, always use the `t` returned by `useI18n()`. Top-level
`t` is only for ordinary modules that cannot call a composable. It does not subscribe a component to
language changes.

With `autoImport: true`, Pinia actions, router guards, and ordinary TypeScript modules may directly
use the base Runtime language APIs. `getLang()` and `getLangLoadState()` are snapshots, not refs. A
store that exposes reactive language state should return the readonly refs from `useI18n()` or manage
and clean up a `subscribe()` listener.

Use the standalone Vue-only `tRef()` in setup or a composable when a predeclared label must react to
language changes. Do not call `tRef()` in a template or render function. A static message-only object
or array can be passed directly to `t()` or `tRef()`; use `defineI18nMessages()` only when selecting a
member or finite dynamic index.

For explicit imports, use `configs.vue` from `@ai-i18n/eslint-plugin`. With `autoImport: true`, use
`configs['vue-auto-import']`. Automatic imports remove the import statement, not the required
`useI18n()` call in `<script setup>`. Keep the preset enabled so snapshot reads in render paths are
reported.

For UI-library locales and Vue-specific troubleshooting, fetch
`https://bosens-china.github.io/ai-i18n/guide/getting-started/vue.md` and
`https://bosens-china.github.io/ai-i18n/guide/faq/vue.md`.
