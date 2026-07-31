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

Pass a whole static message-only object or array directly to `t(messages)`. In Vue setup, the same
structure can be passed to `tRef(messages)`. Use the global `defineI18nMessages()` compile-time macro
only when selecting a member or finite dynamic index.

## Preserve framework reactivity

In Vue, the standalone `t` tracks the adapter revision when a template, render function, or computed
property calls it. It is valid in Composition API and Options API components. React render paths must
still use the `t` returned by `useI18n()`. In ordinary modules, evaluate `t` at call time instead of
storing a translated snapshot.

`getLang()` and `getLangLoadState()` are call-time snapshots. Rendered Vue Composition and React
state must use `currentLang` and `langLoadState` from `useI18n()`. Pure Vue Options uses
`i18nComputed()` as described below. Long-lived non-component listeners must keep and invoke the
cleanup returned by `subscribe()`.

Vue setup and composables may use the standalone `tRef()` export for a predeclared reactive label or
message tree. Pure Options API components use `tComputed()` in their `computed` option for the same
display-value behavior. Do not call either factory in templates or render functions.

Pure Options components spread `i18nComputed()` into `computed` to receive unwrapped reactive
`currentLang`, `langs`, `langLoadState`, `isLangLoading`, and `langLoadError` values. Use the native
Options `watch` field for component-scoped language effects. Keep `getLang()` and
`getLangLoadState()` documented as call-time snapshots.

Vanilla applications must subscribe and render again after language changes.

## Verify extraction

Missing translations fall back to source text. Run a full Vite Build before judging translation
coverage because Dev covers only modules requested by the browser.
