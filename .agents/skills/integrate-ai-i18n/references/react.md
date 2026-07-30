# React integration

Reuse the existing React Vite plugin and React 18 or newer. Do not install a separate ai-i18n React
package.

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

For UI-library locales and React-specific troubleshooting, fetch
`https://bosens-china.github.io/ai-i18n/guide/getting-started/react.md` and
`https://bosens-china.github.io/ai-i18n/guide/faq/react.md`.
