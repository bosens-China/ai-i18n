# Vanilla JavaScript and TypeScript integration

Install `@ai-i18n/vite` and register `aiI18n()`. When no Vue or React Vite plugin is detected, the
mode defaults to Vanilla.

Explicit imports remain the simplest baseline:

```ts
import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n'

function render() {
  document.querySelector('#app')!.textContent = t('保存', '按钮')
}

render()
subscribe(render)
await setLang('en-US')
console.log(getLang(), getLangs())
```

If `unplugin-auto-import` is already registered, these runtime APIs can be used without imports.
ai-i18n injects them and generates `src/ai-i18n.d.ts`; do not add them to the external plugin's
imports list. Use `configs.vanilla` from `@ai-i18n/eslint-plugin` for the matching globals.

Runtime state changes do not mutate existing DOM. Re-render from `subscribe()` after language or HMR
updates. Static extraction ignores unrelated strings and dynamic `t(variable)` calls. Vanilla mode
does not analyze JSX/TSX; select React or Vue mode for those file types. Use `html: true` only when
`index.html` contains supported translation bindings.
