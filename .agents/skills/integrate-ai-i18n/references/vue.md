# Vue integration

Reuse the existing `@vitejs/plugin-vue` and `@vue/compiler-sfc`; do not install a separate ai-i18n Vue
package.

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

Use the standalone Vue-only `tRef()` in setup or a composable when a predeclared label must react to
language changes. Do not call `tRef()` in a template or render function. `tRef` is a standalone export,
not part of the `useI18n()` return value.

For UI-library locales and Vue-specific troubleshooting, fetch
`https://bosens-china.github.io/ai-i18n/guide/getting-started/vue.md` and
`https://bosens-china.github.io/ai-i18n/guide/faq/vue.md`.
