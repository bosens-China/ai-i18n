# Optional features

Read this file only when the user explicitly requests an optional feature or the target build already
uses one. Do not enable adjacent features automatically.

| Feature | Default action | Detailed documentation |
| --- | --- | --- |
| Automatic imports | Keep explicit imports. Set `autoImport: true` only on request. | `https://bosens-china.github.io/ai-i18n/guide/basic/auto-import.md` |
| Automatic translation | Do not configure a Provider unless requested. | `https://bosens-china.github.io/ai-i18n/guide/advanced/ai-translation.md` |
| Language persistence | Do not add `persist`. | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/ai-i18n-persist-options.md` |
| Locale loading | Do not add `loading`. | `https://bosens-china.github.io/ai-i18n/guide/basic/locale-loading.md` |
| Translation Memory limits or cleanup | Do not add `cache` or change `cleanup`. | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/ai-i18n-options.md` |
| HTML extraction | Do not add `html`. | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/html-extractor-options.md` |
| ESLint | Do not install or configure the ESLint plugin unless requested. | `https://bosens-china.github.io/ai-i18n/guide/quality/eslint.md` |
| Vitest | Do not add `aiI18nVitest()` unless requested. | `https://bosens-china.github.io/ai-i18n/guide/quality/testing.md` |

When automatic imports are requested, every mode receives `t`, `setLang`, `getLang`, `getLangs`,
`getLangLoadState`, and `subscribe`. Vue additionally receives `useI18n` and `tRef`; React additionally
receives `useI18n`. Automatic imports do not create framework subscriptions by themselves.

When ESLint is also requested, use `configs.vue` for explicit Vue imports and `configs.recommended` for
explicit React or Vanilla imports. With automatic imports, use `configs['vue-auto-import']`,
`configs['react-auto-import']`, or `configs['vanilla-auto-import']` for the resolved framework mode.

For an option or edge case not covered here, start with
`https://bosens-china.github.io/ai-i18n/llms.txt`. Prefer the installed package's types and behavior
when the deployed documentation conflicts with them.
