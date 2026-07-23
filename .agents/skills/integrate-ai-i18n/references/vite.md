# Vite configuration

Use Vite 8 and a supported Node runtime (`^20.19.0` or `>=22.12.0`). Register the plugin once:

```ts
import { aiI18n } from '@boses/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    aiI18n({
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    }),
  ],
})
```

## Mode resolution

ai-i18n reads Vite's final resolved plugin list:

- `vite:vue` or `vite:vue-jsx` selects `vue`;
- `vite:react*` selects `react`;
- no match selects `vanilla`.

`framework: 'vanilla' | 'vue' | 'react'` overrides a single detected family. A build containing both
Vue and React Vite plugin families is rejected even when `framework` is set. Separate microfrontend
builds may choose different modes.

Vue mode supports `.vue`, JS, TS, JSX, and TSX. React mode supports JS, TS, JSX, and TSX. Vanilla
mode only analyzes JS and TS. HTML extraction is independent:

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  html: true,
})
```

Pass `html: { attributes: [...] }` to replace the default `alt`, `aria-label`, `placeholder`, and
`title` allowlist.

## Auto import and declarations

When `autoImport` is omitted, ai-i18n enables it only if the final plugin list contains
`unplugin-auto-import` or one of its namespaced addons. Set `autoImport: true` or `false` to force
the result.

The external plugin is an opt-in signal; ai-i18n finds unbound calls and injects imports from
`virtual:ai-i18n` itself. Do not duplicate ai-i18n APIs in the external plugin config.

With auto import enabled, the available globals are:

- Vanilla: `t`, `setLang`, `getLang`, `getLangs`, `subscribe`
- Vue/React: `useI18n`

ai-i18n writes `src/ai-i18n.d.ts` by default. Set `dts: 'path/file.d.ts'` to move it or `dts: false`
only when declarations are managed elsewhere. The file declares both `virtual:ai-i18n` and the
mode-specific globals. This is separate from the external Auto Import plugin's declarations for
its own APIs.

Explicit imports are always supported:

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'
// Vue or React mode:
import { useI18n } from 'virtual:ai-i18n'
```

## Option rules

- `locales` is non-empty and locale values are unique.
- `sourceLang` occurs in `locales`.
- `defaultLang` defaults to `sourceLang` and also occurs in `locales`.
- `directory` defaults to `i18n` relative to Vite `root`.
- `translator` and `provider` are optional.
- Cleanup defaults should remain unless explicitly changed.

## Optional Provider

Add `@boses/openai` only when automatic translation is required:

```ts
import { openAI } from '@boses/openai'

const translator = openAI({
  baseURL: process.env.AI_BASE_URL!,
  model: process.env.AI_MODEL!,
  apiKey: process.env.AI_API_KEY,
})

aiI18n({
  sourceLang: 'zh-CN',
  locales,
  translator,
  provider: { batchLength: 12_000, maxConcurrency: 5 },
})
```

Keep secrets in Vite's Node process. `batchLength` measures serialized request length, not tokens.

## Generation behavior

Vite Dev accumulates browser-requested modules; visit lazy routes before judging coverage. Vite Build
starts a fresh state and follows reachable imports. Both modes reconcile stable `cache.json`,
`extracted/**`, and `locales/**`. SSR transforms and runtime injection are skipped with a warning.
