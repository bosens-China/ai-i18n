# React integration

Install `@ai-i18n/react` and `@ai-i18n/vite`; reuse the app's existing React Vite plugin. React 18.3 and React 19 are supported.

Register the React extractor inside `aiI18n()`:

```ts
import { react as aiI18nReact } from '@ai-i18n/react/vite'
import { aiI18n } from '@ai-i18n/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      extractors: [aiI18nReact()],
    }),
    react(),
  ],
})
```

Call the hook inside a component. No React context provider is required:

```tsx
import { useI18n } from '@ai-i18n/react'

export function SaveButton() {
  const { t, setLang, currentLang, langs } = useI18n()

  return (
    <>
      <button>{t('保存', '按钮')}</button>
      <select
        value={currentLang}
        onChange={(event) => void setLang(event.currentTarget.value)}
      >
        {langs.map((lang) => (
          <option key={lang.value} value={lang.value}>{lang.label}</option>
        ))}
      </select>
    </>
  )
}
```

The hook subscribes through `useSyncExternalStore`, so language and translation updates re-render consumers. The extractor recognizes the Hook binding in JS, TS, JSX, and TSX, including custom Hooks in plain `.ts` files. Destructured aliases and `const i18n = useI18n(); i18n.t()` are supported. JSX text is not translated automatically; use static `t()` source and comment arguments.

When a monorepo consumes a locally linked `@ai-i18n/react` package, ensure the binding and
renderer resolve one React instance. If the linked package can resolve a separate React install,
add `resolve: { dedupe: ['react', 'react-dom'] }` to the app's Vite config. A normal published
installation with one peer-resolved React does not need this workspace safeguard.

In a mixed React/Vue JSX project, keep React as the fallback for files outside the Vue JSX plugin's
explicit include glob. Do not require framework suffixes and do not compile one file with both runtimes.
