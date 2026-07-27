# React integration

Install `@ai-i18n/vite@alpha` during prerelease and reuse React 18+ plus the existing React Vite plugin. Do not install a
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
  return <button onClick={() => void setLang('en-US')}>{t('保存')}</button>
}
```

Default to `t(source)`. Use `` t`已加入 ${name}` `` for dynamic values. Pass an options object with
`comment` supplies translation guidance and semantic disambiguation (for example
`t('保存', { comment: '工具栏按钮' })`). It participates in the message ID, so changing it creates a
new untranslated message; do not invent comments for ordinary UI copy.

Set `autoImport: true` explicitly to omit the import. ai-i18n injects it and generates the
declaration. Use `configs.react` from `@ai-i18n/eslint-plugin` to declare the global and validate
static arguments.

For object or array copy, use `defineI18nMessages({...})` without an import and pass its members to
`t()`. Vite and `aiI18nVitest()` erase the marker before runtime.

The Hook uses `useSyncExternalStore`, and its `t` function identity changes with the Runtime revision,
so language and translation updates also invalidate React Compiler caches. It is recognized in JS,
TS, JSX, and TSX, including custom Hooks in `.ts`. JSX text is not translated automatically. Do not
add Vue Vite plugins to the same build.

For locally linked workspaces, `resolve: { dedupe: ['react', 'react-dom'] }` can prevent a second React
instance. A normal peer-resolved installation usually does not need this.

Third-party locale state remains application-owned. Derive Ant Design/date-library locale directly
from `currentLang`. Do not persist already translated strings in long-lived React state; translate
from source/message data during render.

A runnable end-to-end example: fetch `https://bosens-china.github.io/ai-i18n/demo/react.md`.
