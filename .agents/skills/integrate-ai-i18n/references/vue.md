# Vue 3 integration

Install `@ai-i18n/vite@alpha` during prerelease and reuse Vue >= 3.2.25,
`@vitejs/plugin-vue`, and `@vue/compiler-sfc`. Do not install
a separate ai-i18n Vue binding.

```ts
import { aiI18n } from '@ai-i18n/vite'
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

const {
  t,
  setLang,
  currentLang,
  langs,
  isLangLoading,
  langLoadState,
} = useI18n()

async function switchLanguage(value: string) {
  try {
    await setLang(value)
  } catch {
    // Shared state drives generic error UI; this consumes the rejected Promise.
  }
}
</script>

<template>
  <p>{{ t('保存') }}</p>
  <select
    :value="currentLang"
    :disabled="isLangLoading"
    @change="switchLanguage(($event.target as HTMLSelectElement).value)"
  >
    <option v-for="lang in langs" :key="lang.value" :value="lang.value">
      {{ lang.label }}
    </option>
  </select>
  <p v-if="langLoadState.status === 'error'">{{ t('语言包加载失败，请重试') }}</p>
</template>
```

Default to `t(source)`. Use `` t`已加入 ${name}` `` for dynamic values. Pass an options object with
`comment` supplies translation guidance and semantic disambiguation (for example
`t('保存', { comment: '工具栏按钮' })`). It participates in the message ID, so changing it creates a
new untranslated message; do not invent comments for ordinary UI copy.

For ESLint with explicit imports, use `configs.vue` so SFCs are included without declaring Runtime
globals. Set `autoImport: true` explicitly to omit the `useI18n` import; in Vue mode ai-i18n injects
`useI18n`, top-level `t`, and Vue-only `tRef`, then generates their declarations. In that mode use
`configs['vue-auto-import']` instead.

The framework mode applies to the whole build. An ordinary `.js` / `.ts` utility module may import
top-level `t` from `virtual:ai-i18n`, or use its auto-imported form, because it cannot call a
composable. Do not use only top-level `t` in a component render path: it reads the current locale but
does not subscribe that component to later Runtime updates. The Vue ESLint preset warns for this in
templates and JSX/TSX through `ai-i18n/no-unsubscribed-t`.

Auto import removes the `useI18n` import statement, not the composable call. A Vue template must
still receive `t` from `const { t } = useI18n()` in `<script setup>`. A bare template-only `t` has no
ai-i18n binding, is not extracted, and may compile to a missing component-context property; the
`vue-auto-import` ESLint preset reports it as an error.

Destructuring `t` does not break reactivity. Calling it from the template reads the adapter's
Runtime revision, so language and translation updates trigger a new render. Only the translated
result is a snapshot: do not write `const label = t('保存')` when `label` must update. Call `t()` in
the template or import the standalone Vue-only API and use `const label = tRef('保存')`.
`tRef()` returns a readonly `ComputedRef<string>` and also unwraps Ref values inside tagged-template
interpolations. Read `.value` in script; templates unwrap it. It is not returned by `useI18n()`.
Create it once in setup or a composable. Never call `tRef()` in a template or render function,
because that creates a new computed on every render.

For object or array copy, use `defineI18nMessages({...})` without an import and pass its members to
`t()`. The Vue SFC transform erases the macro and understands compiler-generated `unref` wrappers.

Do not save or directly return a translated setup snapshot, whether it appears in `<script setup>`,
a directly exported options object, or an imported `defineComponent()` object/function signature
in `.vue`, `.ts`, or `.tsx`. Call `t` in the template, or derive a script value with
`tRef('保存')`. The Vue ESLint preset reports the snapshot through
`ai-i18n/no-eager-translation`.

`currentLang`, `langs`, `langLoadState`, `isLangLoading`, and `langLoadError` are readonly refs and
unwrap in templates. Access `.value` in script. Loading state is shared Runtime state, covers the
initial lazy default-locale load, and follows last-call-wins for concurrent switches.
Check `langLoadState.status === 'error'` for failure UI; `langLoadError` preserves the original
rejected value and may itself be falsy.
The Hook works in SFCs, JS/TS composables, and Vue JSX/TSX. Add `@vitejs/plugin-vue-jsx` for JSX/TSX;
it also identifies the build as Vue. Do not add a React Vite plugin to the same build.

SFC analysis respects template aliases, `v-for`/slot locals, and separate `<script>` scopes. External
`<script src>` content is extracted under its JS/TS file. Ordinary template text is not guessed.

A runnable end-to-end example: fetch `https://bosens-china.github.io/ai-i18n/demo/vue.md`.
