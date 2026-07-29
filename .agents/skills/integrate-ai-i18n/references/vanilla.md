# Vanilla JavaScript and TypeScript integration

Install `@ai-i18n/vite@alpha` during prerelease and register `aiI18n()`. When no Vue or React Vite plugin is detected, the
mode defaults to Vanilla.

Explicit imports remain the simplest baseline. The following example is plain JavaScript and also
works unchanged in TypeScript:

```js
import {
  getLang,
  getLangLoadState,
  getLangs,
  setLang,
  subscribe,
  t,
} from 'virtual:ai-i18n'

const app = document.querySelector('#app')
if (!app) throw new Error('Missing #app element')

function render() {
  app.textContent = t('保存')
}

render()
subscribe(render)
try {
  await setLang('en-US')
} catch {
  console.error(getLangLoadState().error)
}
console.log(getLang(), getLangs(), getLangLoadState())
```

Default to `t(source)`. Use `` t`已加入 ${name}` `` for dynamic values. Pass an options object with
`comment` supplies translation guidance and semantic disambiguation (for example
`t('保存', { comment: '工具栏按钮' })`). It participates in the message ID, so changing it creates a
new untranslated message; do not invent comments for ordinary UI copy.

Set `autoImport: true` explicitly to use these Runtime APIs without imports. ai-i18n injects them and
generates `src/ai-i18n.d.ts`. Use `configs['vanilla-auto-import']` from
`@ai-i18n/eslint-plugin` for the matching globals. With explicit imports, use
`configs.recommended`.

Runtime state changes do not mutate existing DOM. Re-render from `subscribe()` after language,
loading-state, or HMR updates. `getLangLoadState()` returns an immutable
`idle` / `loading` / `error` snapshot. Static extraction ignores unrelated strings and dynamic
`t(variable)` calls. Vanilla mode does not analyze JSX/TSX; select React or Vue mode for those file
types. Use `html: true` only when `index.html` contains supported translation bindings.

Evaluate `t()` at render or event time. A module-level `const label = t('保存')` stores an
initialization snapshot; prefer `const getLabel = () => t('保存')`. The Vanilla ESLint preset reports
the snapshot through `ai-i18n/no-eager-translation`.

For object or array copy, use `defineI18nMessages({...})` without an import and pass its members to
`t()`. Dynamic indexes enumerate only finite AST candidates; the macro does not execute or freeze
the collection.

A runnable end-to-end example: fetch `https://bosens-china.github.io/ai-i18n/demo/vanilla.md`.
