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

Explicit import. This example is valid JSX and TSX:

```jsx
import { useI18n } from 'virtual:ai-i18n'

export function SaveButton() {
  const { t, setLang, isLangLoading, langLoadState } = useI18n()
  async function switchLanguage() {
    try {
      await setLang('en-US')
    } catch {
      // Shared state drives generic error UI; this consumes the rejected Promise.
    }
  }
  return (
    <>
      <button disabled={isLangLoading} onClick={() => void switchLanguage()}>
        {isLangLoading ? t('正在加载语言包…') : t('保存')}
      </button>
      {langLoadState.status === 'error' ? (
        <p>{t('语言包加载失败，请重试')}</p>
      ) : null}
    </>
  )
}
```

Default to `t(source)`. Use `` t`已加入 ${name}` `` for dynamic values. Pass an options object with
`comment` supplies translation guidance and semantic disambiguation (for example
`t('保存', { comment: '工具栏按钮' })`). It participates in the message ID, so changing it creates a
new untranslated message; do not invent comments for ordinary UI copy.

For ESLint with explicit imports, use `configs.recommended`. Set `autoImport: true` explicitly to
omit the import; in React mode ai-i18n injects `useI18n` and top-level `t`, then generates both
declarations. In that mode use `configs['react-auto-import']` instead.

The framework mode applies to the whole build. An ordinary `.js` / `.ts` utility module may import
top-level `t` from `virtual:ai-i18n`, or use its auto-imported form, because it cannot call a Hook.
Do not use only top-level `t` in a component render path: it reads the current locale but does not
subscribe that component to later Runtime updates. The React ESLint preset warns for this through
`ai-i18n/no-unsubscribed-t`, and warns for module-initialization snapshots such as
`const label = t('保存')` through `ai-i18n/no-eager-translation`.

For a whole static message-only object or array, call `const labels = t(messages)` inside the
component after obtaining `t` from `useI18n()`. The Hook subscription rerenders the component and
the next call returns the new translated tree. Local and imported `const` trees need neither
`as const` nor a macro. Every string leaf is translated and primitive non-string leaves are
preserved; only plain objects and arrays are supported, with no per-leaf comment or interpolation.
When selecting one member or finite dynamic index, use `defineI18nMessages({...})` without an import
and pass its member to `t()`. Vite and `aiI18nVitest()` erase the marker before runtime.

The Hook uses `useSyncExternalStore`, and its `t` function identity changes with the Runtime revision,
so language, translation, and loading-state updates also invalidate React Compiler caches. It
returns `langLoadState`, `isLangLoading`, and `langLoadError`; the shared state covers the initial
lazy default-locale load and follows last-call-wins for concurrent switches. The Hook is recognized
in JS, TS, JSX, and TSX, including custom Hooks in `.ts`. JSX text is not translated automatically.
Do not add Vue Vite plugins to the same build.

React Compiler directives do not change the API boundary: `"use memo"` may cache an untracked
top-level `t` result, while `"use no memo"` still does not subscribe the component. Use the Hook in
both cases.

Check `langLoadState.status === 'error'` when rendering failure UI. `langLoadError` preserves the
original rejected value, which may itself be falsy, and is only the error detail.

For locally linked workspaces, `resolve: { dedupe: ['react', 'react-dom'] }` can prevent a second React
instance. A normal peer-resolved installation usually does not need this.

Third-party locale state remains application-owned. Derive Ant Design/date-library locale directly
from `currentLang`. Do not persist already translated strings in long-lived React state; translate
from source/message data during render.

For the Vite scaffolding walkthrough, UI-library locale providers, and framework-specific FAQ,
fetch `https://bosens-china.github.io/ai-i18n/guide/getting-started/react.md`. A runnable example is
available at `https://bosens-china.github.io/ai-i18n/demo/react.md`.
