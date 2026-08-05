# Translation and runtime rules

## Extract translatable copy explicitly

Put translatable copy in `t()`. By default, ordinary strings, JSX text, Vue template text, and HTML
text are not extracted. HTML text and supported attributes are extracted only when the user explicitly
enables the optional HTML extractor.

Use a static `comment` only when wording needs context or semantic disambiguation:

```ts
t('保存', { comment: '工具栏按钮' })
```

Use a tagged template for dynamic values. Preserve every generated placeholder in translated output:

```ts
t`已加入 ${name}`
```

When code must return an HTML string, keep structural markup out of the translatable source. Build the
trusted or escaped markup in code and pass it as an interpolation so the translator only controls
language, punctuation, units, and placeholder order:

```ts
const valueHtml = `<span style="font-weight:bold">${voltage}</span>`
t`电压：${valueHtml} V`
```

Do not claim that template interpolation sanitizes HTML. Preserve the consuming API's existing trust
and escaping boundary.

Pass a whole static message-only object or array directly to `t(messages)`. In Vue setup, the same
structure can be passed to `tRef(messages)`. Use the global `defineI18nMessages()` compile-time macro
only when selecting a member or finite dynamic index.

## Preserve framework reactivity

In Vue, the standalone `t` tracks the adapter revision when a template, render function, or computed
property calls it. It is valid in Composition API and Options API components. React render paths must
still use the `t` returned by `useI18n()`. In ordinary modules, evaluate `t` at call time instead of
storing a translated snapshot.

For long-lived configuration such as chart options, menus, or route metadata, replace a module-level
translated object with a factory and call it when the consumer renders or rebuilds after a language
change:

```ts
export function createChartOptions() {
  return { title: { text: t('销量') } };
}
```

For a finite centralized title set, declare it with `defineI18nMessages()` and translate the selected
member inside a call-time getter or function. In Vue setup, use `tRef()` for a stored reactive label;
in pure Options API, use `tComputed()` directly in the root `computed` option. Do not silence
`no-eager-translation` by keeping a module or setup snapshot that must change with the language.

If a third-party configuration field explicitly accepts a lazy message callback, translate inside
that callback. For example, async-validator accepts a function-valued `message`:

```ts
const rules = {
  password: {
    required: true,
    message: () => t('请输入旧密码'),
  },
}
```

Do not replace a reported `t()` call with a fixed source-language literal. Do not invent a callback
when the target API does not document function support; use a factory or framework-reactive API instead.

`getLang()` and `getLangLoadState()` are call-time snapshots. Rendered Vue Composition and React
state must use `currentLang` and `langLoadState` from `useI18n()`. Pure Vue Options uses
`i18nComputed()` as described below. Long-lived non-component listeners must keep and invoke the
cleanup returned by `subscribe()`. Do not store those snapshots in ordinary Vue `setup()` or Options
`data()` when the value must update with the language; the ESLint preset reports these direct stores.

Vue setup and composables may use the standalone `tRef()` export for a predeclared reactive label or
message tree. Pure Options API components use `tComputed()` in their `computed` option for the same
display-value behavior. Do not call either factory in templates or render functions.

Pure Options components spread `i18nComputed()` into `computed` to receive unwrapped reactive
`currentLang`, `langs`, `langLoadState`, `isLangLoading`, and `langLoadError` values. Use the native
Options `watch` field for component-scoped language effects. Do not call `i18nComputed()` from setup,
data, methods, render, or templates. Keep `getLang()` and `getLangLoadState()` documented as call-time
snapshots.

Vanilla applications must subscribe and render again after language changes.

## Verify extraction

Missing translations fall back to source text. Run a full Vite Build before judging translation
coverage because Dev covers only modules requested by the browser.
