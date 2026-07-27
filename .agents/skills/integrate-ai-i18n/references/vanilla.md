# Vanilla JavaScript and TypeScript integration

Install `@ai-i18n/vite@alpha` during prerelease and register `aiI18n()`. When no Vue or React Vite plugin is detected, the
mode defaults to Vanilla.

Explicit imports remain the simplest baseline:

```ts
import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n'

function render() {
  document.querySelector('#app')!.textContent = t('保存')
}

render()
subscribe(render)
await setLang('en-US')
console.log(getLang(), getLangs())
```

Default to `t(source)`. Use `` t`已加入 ${name}` `` for dynamic values. Pass an options object with
`comment` supplies translation guidance and semantic disambiguation (for example
`t('保存', { comment: '工具栏按钮' })`). It participates in the message ID, so changing it creates a
new untranslated message; do not invent comments for ordinary UI copy.

Set `autoImport: true` explicitly to use these Runtime APIs without imports. ai-i18n injects them and
generates `src/ai-i18n.d.ts`. Use `configs.vanilla` from `@ai-i18n/eslint-plugin` for the matching
globals.

Runtime state changes do not mutate existing DOM. Re-render from `subscribe()` after language or HMR
updates. Static extraction ignores unrelated strings and dynamic `t(variable)` calls. Vanilla mode
does not analyze JSX/TSX; select React or Vue mode for those file types. Use `html: true` only when
`index.html` contains supported translation bindings.

For object or array copy, use `defineI18nMessages({...})` without an import and pass its members to
`t()`. Dynamic indexes enumerate only finite AST candidates; the macro does not execute or freeze
the collection.

A runnable end-to-end example: fetch `https://bosens-china.github.io/ai-i18n/demo/vanilla.md`.
