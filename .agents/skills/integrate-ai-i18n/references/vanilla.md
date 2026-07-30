# Vanilla JavaScript and TypeScript integration

When the Vite build has no Vue or React plugin, ai-i18n uses Vanilla mode.

```ts
import { getLangs, setLang, subscribe, t } from 'virtual:ai-i18n'

const app = document.querySelector('#app')

function render() {
  if (app) app.textContent = t('保存')
}

render()
const unsubscribe = subscribe(render)

void setLang('en-US')
console.log(getLangs())
window.addEventListener('pagehide', unsubscribe, { once: true })
```

Vanilla mode does not update the DOM automatically. Subscribe and render again after language changes.
Use `t(source)` for ordinary copy, a tagged template for dynamic values, and `comment` only when
translation context matters:

```ts
t('保存', { comment: '工具栏按钮' })
t`已加入 ${name}`
```

Evaluate `t()` at render or event time. Do not keep `const label = t('保存')` as a module-level
snapshot. A static message-only object or array can be passed directly to `t(messages)`; use
`defineI18nMessages()` only when selecting a member or finite dynamic index.

For explicit imports, use `configs.recommended` from `@ai-i18n/eslint-plugin`. With
`autoImport: true`, use `configs['vanilla-auto-import']`.

For a complete example, fetch `https://bosens-china.github.io/ai-i18n/guide/getting-started/vanilla.md`.
