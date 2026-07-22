# Vue 3 integration

Use Vue 3 Composition API with `<script setup lang="ts">`. Install `@ai-i18n/vue` and `@ai-i18n/vite`; reuse the app's existing Vite Vue plugin and Vue compiler packages.

Register the Vue extractor inside `aiI18n()` and keep the normal Vue plugin:

```ts
import { aiI18n } from '@ai-i18n/vite'
import { vue as aiI18nVue } from '@ai-i18n/vue/vite'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nVue()],
    }),
    vue(),
  ],
})
```

Use the Composition API binding directly; do not call `app.use()` and do not create a separate provider:

```vue
<script setup lang="ts">
import { useI18n } from '@ai-i18n/vue'

const { t, setLang, currentLang, langs } = useI18n()
</script>

<template>
  <p>{{ t('保存', '按钮') }}</p>
  <select :value="currentLang" @change="setLang(($event.target as HTMLSelectElement).value)">
    <option v-for="lang in langs" :key="lang.value" :value="lang.value">
      {{ lang.label }}
    </option>
  </select>
</template>
```

`currentLang` and `langs` are readonly refs and are automatically unwrapped in templates. Access `.value` when consuming them in script. `setLang` is asynchronous.

Prefer the exact `const { t } = useI18n()` convention so static analysis remains obvious. The Vue extractor analyzes script blocks and template expressions, but it does not guess ordinary template text. Keep every translated source and comment static.
