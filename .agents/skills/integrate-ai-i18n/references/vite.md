# Vite configuration

Use Vite ≥ 8 and a supported Node runtime (`^20.19.0` or `>=22.12.0`). Register the plugin once:
During the alpha period install `@ai-i18n/vite@alpha`; an untagged install may resolve an older
`latest`.

```ts
import { aiI18n } from '@ai-i18n/vite'
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
global `defineI18nMessages<T>(value)` macro. With auto import enabled, it additionally declares the
mode-specific Runtime globals. This is separate from the external Auto Import plugin's declarations
for its own APIs. The generated file carries noformat, ts-nocheck, and eslint-disable markers.
Prettier honors noformat for the whole file when `--check-ignore-pragma` is enabled; the generated
declarations also use stable Prettier-compatible formatting when that option is absent.

Explicit imports are always supported:

```ts
import { getLangs, setLang, t } from 'virtual:ai-i18n'
// Vue or React mode:
import { useI18n } from 'virtual:ai-i18n'
```

## Option rules

- `locales` is non-empty and locale values are unique.
- `sourceLang` occurs in `locales`.
- `defaultLang` defaults to `sourceLang`; omit it when both are equal. A non-source value also
  occurs in `locales`.
- `directory` defaults to `i18n` relative to Vite `root`.
- `persist` is false by default; `true` uses `ai-i18n:lang`, or pass `{ key }`.
- `detect` is false by default; `'navigator'` matches exact locale then primary language.
- `fallback` defaults to `'source'`; supported values are `'source'`, `'key'`, `'empty'`, and
  `'marked'`.
- `translator` and `provider` are optional.
- `cache.maxMessages` and `cache.maxBytes` are optional positive integers.
- Cleanup defaults should remain unless explicitly changed.

The complete field list, nested types (`LangOption`, `HtmlExtractorOptions`, etc.), and defaults
table live at `api/vite.md` in [SKILL.md](../SKILL.md)'s doc table; fetch it before assuming an
undocumented field's shape.

`defineI18nMessages<T>(value)` is independent of `autoImport`: it is an import-free compiler macro
declared in every generated `ai-i18n.d.ts`. Vite erases it to `(value)` in browser and SSR
transforms, while `aiI18nVitest()` applies the same erasure. A local binding with that name shadows
the macro. It must be called directly rather than assigned or passed as a runtime value. It accepts
any `T` and does not freeze, clone, validate, or execute collection members.

## Optional Provider

Add `@ai-i18n/openai@alpha` during prerelease only when automatic translation is required:

```ts
import { openAI } from '@ai-i18n/openai'

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
`debounceMs` (default `100`, merges consecutive Dev misses) and `strict` (default `false`, throws on
`flush` when a translation failed or is still `null`) are also available; see `api/vite.md` for the
full Provider option table.

## Optional locale loading

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  loading: {
    strategy: 'locale',
    preload: ['en-US'],
    prefetch: ['ja-JP'],
  },
})
```

Locale loading is opt-in and preserves eager all-locale registration when omitted. Each target locale
becomes an independent Vite chunk. `preload` emits a `modulepreload` hint, `prefetch` emits a
lower-priority browser hint, and unlisted targets load on their first `setLang()` call. Never include
`sourceLang` or place the same locale in both lists; duplicates within one list are normalized away.

A non-source `defaultLang` is automatically preloaded and uses the source fallback until it loads; a
failed `setLang()` keeps the current language. Concurrent-load Promise sharing and other edge cases:
see `api/vite.md`'s loading section.

## Optional cache capacity

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  cache: {
    maxMessages: 20_000,
    maxBytes: 10 * 1024 * 1024,
  },
})
```

Capacity control is opt-in and only prunes inactive Translation Memory, never messages referenced by
active extracted files or the current ProjectState; if protected data alone exceeds a limit, Vite
warns and keeps it instead of dropping it. `maxBytes` measures the UTF-8 bytes of the entire stable
`cache.json` serialization, not just the pruned messages — size it against the whole file.
`cleanup.orphanMessages: true` deletes all inactive messages first, ahead of these limits;
`cleanup.missingSourceFiles` separately decides whether missing source records still protect their
messages. The exact pruning order (a rare debugging detail): see `api/vite.md`'s cache section.

## Generation behavior

Vite Dev accumulates browser-requested modules; visit lazy routes before judging coverage. Vite Build
starts a fresh state and follows reachable imports. Both modes reconcile stable `cache.json`,
`extracted/**`, and `locales/**`.

`cache.json` uses schema v2 and contains only `version` plus messages keyed by readable message ID.
Each message stores its `sourceLang`, optional comment, and target translations. `comment` never
affects the message ID; a new ID first inherits translations from any historical entry sharing the
same parsed source (this is what migrates legacy `source#comment` IDs once comment changes). Only
when no same-source entry exists, and the source language itself changed, does ai-i18n uniquely
reverse-match the new source against a historical entry whose translation for the new source
language equals it; comment does not need to match for this reverse match. Extracted files are
flat (for example, `src_components_App.tsx.json`), and locale files are generated only for
non-source targets.

`vite build --watch` creates ProjectState on the first build and reuses it on later rebuilds.
Unchanged source fingerprints reuse their AST; changed static dependencies refresh necessary reverse
dependents. Edits to extracted or target locale files update translations and registration without
parsing unchanged source. Deleted, renamed, or newly unreachable modules leave the active graph while
Translation Memory remains available. Restart the Watch process after Vite config, plugin, extractor,
or schema changes.

SSR extraction, registration, and runtime injection are skipped with a warning, but compiler-macro
erasure still runs. The per-build reuse table (what exactly is re-parsed vs. reused) lives in
`api/vite.md`'s Build Watch section.

For Vitest, use `aiI18nVitest(options)` from `@ai-i18n/vite/vitest`. Do not run the production plugin
or maintain a `virtual:ai-i18n` alias just for unit tests; see `guide/advanced/testing.md` for the
shared-options pattern and test-environment capability scope.
