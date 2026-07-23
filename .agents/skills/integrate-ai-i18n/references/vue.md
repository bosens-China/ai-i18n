# Vue 3 integration

Install `@boses/vite` and reuse Vue 3, `@vitejs/plugin-vue`, and `@vue/compiler-sfc`. Do not install
a separate ai-i18n Vue binding.

```ts
import { aiI18n } from '@boses/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
    vue(),
  ],
})
```

The Vue plugin is detected from the final Vite plugin list. Set `framework: 'vue'` only when a custom
plugin setup cannot be detected.

Use Composition API with `<script setup lang="ts">`. Explicit import:

```vue
<script setup lang="ts">
import { useI18n } from 'virtual:ai-i18n'

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

If `unplugin-auto-import` is registered, omit the `useI18n` import. ai-i18n injects it and generates
its declaration; do not add it to the external plugin's imports list. Use `configs.vue` from
`@boses/eslint-plugin` to declare the global and validate static arguments.

`currentLang` and `langs` are readonly refs and unwrap in templates. Access `.value` in script.
The Hook works in SFCs, JS/TS composables, and Vue JSX/TSX. Add `@vitejs/plugin-vue-jsx` for JSX/TSX;
it also identifies the build as Vue. Do not add a React Vite plugin to the same build.

SFC analysis respects template aliases, `v-for`/slot locals, and separate `<script>` scopes. External
`<script src>` content is extracted under its JS/TS file. Ordinary template text is not guessed.
