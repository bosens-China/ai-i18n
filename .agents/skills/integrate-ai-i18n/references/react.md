# React integration

Reuse the existing React Vite plugin and React 18 or newer. Do not install a separate ai-i18n React
package. Let ai-i18n detect React from the final Vite plugin list. Set `framework: 'react'` only when
a custom plugin setup cannot be detected.

Use `useI18n()` in components so they update after a language change:

```tsx
import { useI18n } from 'virtual:ai-i18n'

export function SaveButton() {
  const { currentLang, setLang, t } = useI18n()

  return (
    <button onClick={() => void setLang(currentLang === 'en-US' ? 'zh-CN' : 'en-US')}>
      {t('保存')}
    </button>
  )
}
```

Use `t(source)` for ordinary copy, a tagged template for dynamic values, and `comment` only when
translation context matters:

```ts
t('保存', { comment: '工具栏按钮' })
t`已加入 ${name}`
```

Do not use top-level `t` in a component render path. It is appropriate for ordinary modules that
cannot call a Hook, but evaluate it at call time instead of saving a translated string in module state.
A static message-only object or array can be passed directly to `t(messages)`; use
`defineI18nMessages()` only when selecting a member or finite dynamic index.

For explicit imports, use `configs.recommended` from `@ai-i18n/eslint-plugin`. With
`autoImport: true`, use `configs['react-auto-import']`.

For UI-library locales and React-specific troubleshooting, fetch
`https://bosens-china.github.io/ai-i18n/guide/getting-started/react.md` and
`https://bosens-china.github.io/ai-i18n/guide/faq/react.md`.
