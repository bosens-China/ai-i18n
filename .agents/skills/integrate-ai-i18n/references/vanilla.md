# Vanilla JavaScript and TypeScript integration

Install `@ai-i18n/vite`, register `aiI18n()` using the shared Vite guidance, and import the browser runtime directly:

```ts
import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n'

function render() {
  document.querySelector('#app')!.textContent = t('保存', '按钮')
}

render()
subscribe(render)

console.log(getLang(), getLangs())
await setLang('en-US')
```

Use the same imports in JavaScript, omitting TypeScript-only syntax. TypeScript projects must expose `@ai-i18n/vite/client` as described in the Vite reference.

`t()` returns the value for the current runtime state; it cannot update DOM nodes that the application already rendered. Re-render from `subscribe()` after language or HMR translation updates, or use the application's existing reactive/rendering mechanism.

Static extraction recognizes explicit calls bound to `virtual:ai-i18n`. It does not translate unrelated strings or dynamic `t(variable)` arguments. For JSX/TSX applications use the React reference instead. Add `html()` only when `index.html` itself contains supported translation bindings.
