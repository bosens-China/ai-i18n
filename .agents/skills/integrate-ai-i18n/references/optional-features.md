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
| Translation Memory storage | Keep the default sharded JSON; change `translationMemory.storage` only on request. | `https://bosens-china.github.io/ai-i18n/guide/advanced/translation-memory.md` |
| Provider cache refresh | Keep `provider.cache: 'reuse'`; use `fresh` only when the user requests one process-level Provider refresh. It applies equally to Dev and Build and never changes MCP behavior. | `https://bosens-china.github.io/ai-i18n/guide/advanced/translation-memory.md` |
| HTML extraction | Do not add `html`. | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/html-extractor-options.md` |
| ESLint | Do not install or configure the ESLint plugin unless requested. | `https://bosens-china.github.io/ai-i18n/guide/quality/eslint.md` |
| Vitest | Do not add `aiI18nVitest()` unless requested. | `https://bosens-china.github.io/ai-i18n/guide/quality/testing.md` |

When automatic imports are requested, every mode receives `t`, `setLang`, `getLang`, `getLangs`,
`getLangLoadState`, and `subscribe`. Vue additionally receives `useI18n`, `tRef`, `i18nComputed`, and
`tComputed`; React additionally receives `useI18n`. Vue may use an unbound `t` directly in scripts
and templates because the Vue adapter export tracks its revision. Keep the generated dts in the
TypeScript project so Vue language-tools can type template `t`; do not add an Options
`methods: { t }` bridge in automatic mode. Local Vue bindings take precedence, and `this.t` /
`this.$t` remain unsupported. React automatic `t` still does not create a component subscription.

When ESLint is also requested, use `configs.vue` for explicit Vue imports and `configs.recommended` for
explicit React or Vanilla imports. With automatic imports, use `configs['vue-auto-import']`,
`configs['react-auto-import']`, or `configs['vanilla-auto-import']` for the resolved framework mode.
Do not recreate their API lists manually: the Vue preset also tracks `i18nComputed()` placement and
Vue setup / Options data snapshot boundaries.

When enabling ESLint, inspect the target build's `resolve.alias`. Do not load or execute
`vite.config.*`. If a local-source alias exists only in Vite, prefer moving its string-to-string
mapping into a shared module whose replacements are absolute paths, then pass the same object to Vite
and ESLint through `settings['ai-i18n'].alias`. Do not create a TypeScript config only to duplicate
that alias. Vite alias arrays, regular-expression matches, `customResolver`, and resolver plugins are
outside this contract.

ESLint import resolution checks `settings['ai-i18n'].alias` first. When no explicit alias matches, it
searches upward from the importer for the nearest `tsconfig.json` or `jsconfig.json`; when both are in
the same directory, `tsconfig.json` wins. Keep `tsconfigPath` only for non-standard config names or
when the project must pin discovery to a specific solution config. Before reporting completion, run
ESLint on at least one source file whose translation dependency is reached through an aliased import
and confirm that the rule follows it.

For an option or edge case not covered here, start with
`https://bosens-china.github.io/ai-i18n/llms.txt`. Prefer the installed package's types and behavior
when the deployed documentation conflicts with them.
