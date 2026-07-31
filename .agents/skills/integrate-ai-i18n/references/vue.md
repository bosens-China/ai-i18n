# Vue integration

Reuse the existing `@vitejs/plugin-vue` and `@vue/compiler-sfc`; do not install a separate ai-i18n Vue
package.

Use Composition API with `<script setup lang="ts">`:

```vue
<script setup lang="ts">
import { t, useI18n } from 'virtual:ai-i18n';

const { currentLang, langs, setLang } = useI18n();

async function switchLanguage(value: string) {
  await setLang(value);
}
</script>

<template>
  <p>{{ t('保存') }}</p>
  <select
    :value="currentLang"
    @change="switchLanguage(($event.target as HTMLSelectElement).value)"
  >
    <option v-for="lang in langs" :key="lang.value" :value="lang.value">
      {{ lang.label }}
    </option>
  </select>
</template>
```

Prefer the standalone `t` import for new setup components. `useI18n().t` is the same function and
remains supported, including as a zero-import binding when automatic imports are enabled. The Vue
adapter owns one shared revision; template, render, and computed calls collect that dependency.
Calling `useI18n()` does not create a separate per-component translation subscription. When new code
needs language state, use `useI18n()` for refs and actions such as `currentLang`, `langLoadState`, and
`setLang`.

For an existing Options API component, import the standalone Vue `t` and call it directly from
computed properties, methods, and the template:

```vue
<script lang="ts">
import { defineComponent } from 'vue';
import { t } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    label() {
      return t('保存');
    },
  },
  methods: {
    t,
  },
});
</script>

<template>
  <p :title="label">{{ t('保存') }}</p>
</template>
```

When the component intentionally stays on pure Options API, preserve that style and spread
`i18nComputed()` into `computed`. Use `tComputed()` for a predeclared reactive label or message tree:

```vue
<script lang="ts">
import { defineComponent } from 'vue';
import { i18nComputed, setLang, t, tComputed } from 'virtual:ai-i18n';

export default defineComponent({
  computed: {
    ...i18nComputed(),
    saveLabel: tComputed('保存'),
  },
  watch: {
    currentLang(next: string, previous: string) {
      console.log(previous, '->', next);
    },
  },
  methods: {
    t,
    switchLanguage(value: string) {
      return setLang(value);
    },
  },
});
</script>

<template>
  <button :disabled="isLangLoading">{{ t('保存') }} / {{ saveLabel }}</button>
</template>
```

Use `defineComponent()` and keep TypeScript `strict` or `noImplicitThis` enabled so the expanded
computed fields remain available to IDE completion in methods, other computed getters, and watch
handlers. Vue's Options `watch` map does not infer callback value types from the watched key, so add
explicit `string` annotations to the `currentLang` callback parameters. Do not add an ai-i18n wrapper
around `defineComponent()` solely to change this Vue type boundary, and do not replace an existing
pure Options component with Composition API solely for ai-i18n.

With `autoImport: false`, expose an explicitly imported `t` from a pure Options component through
`methods: { t }` when its template calls `t()`. A normal Options `<script>` import stays in module
scope and is not exposed on the component instance, unlike a top-level `<script setup>` binding.
Keep script calls lexical as `t()`; do not rewrite them to `this.t()`, which is not an extraction
form.

Only treat this bridge as extractable when the SFC directly exports an object literal or passes an
object literal directly to a statically recognized `defineComponent()`. If that root object has any
top-level spread, `extends`, or `mixins`, conservatively treat the template bridge as unproven even
when Vue runtime and Volar accept the merged method. Move `methods: { t }` to a direct root Options
object, or call the imported lexical `t()` in a computed getter and render the computed result.

With `autoImport: true`, omit ai-i18n imports for unbound APIs. Vue auto import covers bare `t()` in
`<script setup>`, ordinary `<script>`, pure Options, and templates; it also covers `useI18n`, `tRef`,
`i18nComputed`, and `tComputed`. Do not add `methods: { t }` solely for an auto-imported Options
template. Keep the generated declaration file inside the app's TypeScript project so Vue
language-tools and `vue-tsc` can type bare template `t`.

Only promise template extraction and injection for the default HTML template syntax or
`lang="html"`. For Pug or another template preprocessor, call `t()` in `<script>` or a computed
getter and expose the translated result to the template.

Preserve template locals and component props, data, computed properties, methods, inject values, and
setup returns with the same name; those bindings take precedence over automatic import. The Vue
template declaration does not install a component-instance method. Do not generate or accept
`this.t`, `this.$t`, mixins, or `globalProperties` as ai-i18n calls, even if a Vue type augmentation
makes `this.t` visible to the editor. Prefer `<script setup>` for new components even though Options
API is supported.

Use the standalone Vue-only `tRef()` in setup or a composable when a predeclared label must react to
language changes. Do not call `tRef()` in a template or render function. `tRef` is a standalone export,
not part of the `useI18n()` return value. In pure Options, put `tComputed()` directly in `computed`;
do not put it in `data()` or call it from the template.

For UI-library locales and Vue-specific troubleshooting, fetch
`https://bosens-china.github.io/ai-i18n/guide/getting-started/vue.md` and
`https://bosens-china.github.io/ai-i18n/guide/faq/vue.md`.
