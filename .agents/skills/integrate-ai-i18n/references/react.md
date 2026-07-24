# React integration

Install `@ai-i18n/vite` and reuse React 18.3/19 plus the existing React Vite plugin. Do not install a
separate ai-i18n React binding.

```ts
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
    }),
    react(),
  ],
})
```

The React plugin is detected from the final Vite plugin list. Set `framework: 'react'` only for a
custom plugin setup that cannot be detected.

Explicit import:

```tsx
import { useI18n } from 'virtual:ai-i18n'

export function SaveButton() {
  const { t, setLang, currentLang, langs } = useI18n()
  return <button onClick={() => void setLang('en-US')}>{t('保存', '按钮')}</button>
}
```

If `unplugin-auto-import` is registered, omit the import. ai-i18n injects it and generates the
declaration; do not add it to the external plugin's imports list. Use `configs.react` from
`@ai-i18n/eslint-plugin` to declare the global and validate static arguments.

The Hook uses `useSyncExternalStore`, so language and translation updates re-render consumers. It is
recognized in JS, TS, JSX, and TSX, including custom Hooks in `.ts`. JSX text is not translated
automatically. Do not add Vue Vite plugins to the same build.

For locally linked workspaces, `resolve: { dedupe: ['react', 'react-dom'] }` can prevent a second React
instance. A normal peer-resolved installation usually does not need this.
