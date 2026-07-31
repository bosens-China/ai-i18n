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

For an existing ordinary `<script>` component, keep Composition API and expose the hook binding
directly from `setup()`:

```vue
<script lang="ts">
import { defineComponent } from 'vue'
import { useI18n } from 'virtual:ai-i18n'

export default defineComponent({
  setup() {
    const { t } = useI18n()
    return { t }
  },
})
</script>

<template>
  <p>{{ t('保存') }}</p>
</template>
```

Only treat bindings statically proven to come from `useI18n()` and exposed by the sole top-level
`return { ... }` in `setup()` as template translation bindings. Do not infer conditional or multiple
returns, `this.t`, `this.$t`, mixins, `globalProperties`, or same-named Options API methods. Prefer
`<script setup>` for new components. Also reject return objects with spreads, computed or duplicate
keys, and hook objects whose `.t` member is reassigned.

Use the standalone Vue-only `tRef()` in setup or a composable when a predeclared label must react to
language changes. Do not call `tRef()` in a template or render function. `tRef` is a standalone export,
not part of the `useI18n()` return value.

For UI-library locales and Vue-specific troubleshooting, fetch
`https://bosens-china.github.io/ai-i18n/guide/getting-started/vue.md` and
`https://bosens-china.github.io/ai-i18n/guide/faq/vue.md`.
