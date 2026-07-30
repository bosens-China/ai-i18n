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

For a complete example, fetch `https://bosens-china.github.io/ai-i18n/guide/getting-started/vanilla.md`.
