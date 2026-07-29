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

`autoImport` defaults to `false`. Set `autoImport: true` explicitly to let ai-i18n find unbound calls
and inject imports from `virtual:ai-i18n`. Other Vite plugins never change this option.

With auto import enabled, the available globals are:

- Vanilla: `t`, `setLang`, `getLang`, `getLangs`, `getLangLoadState`, `subscribe`
- Vue: `useI18n`, `t`, `tRef`
- React: `useI18n`, `t`

ai-i18n writes `src/ai-i18n.d.ts` by default. Set `dts: 'path/file.d.ts'` to move it or `dts: false`
only when declarations are managed elsewhere. The file declares both `virtual:ai-i18n` and the
global `defineI18nMessages<T>(value)` macro. With auto import enabled, it additionally declares the
mode-specific Runtime globals. The generated file carries noformat, ts-nocheck, and eslint-disable
markers.
Prettier honors noformat for the whole file when `--check-ignore-pragma` is enabled; the generated
declarations also use stable Prettier-compatible formatting when that option is absent.

Explicit imports are always supported:

```ts
import { getLangLoadState, getLangs, setLang, t } from 'virtual:ai-i18n'
// Vue or React mode:
import { useI18n } from 'virtual:ai-i18n'
// Vue mode only:
import { tRef } from 'virtual:ai-i18n'
```

Vue/React components should obtain `t` from `useI18n()` so they subscribe to Runtime updates.
Top-level `t` is intended for ordinary JS/TS modules that cannot call a Hook, and should be evaluated
inside a function or getter rather than stored during module initialization. The matching ESLint
presets report both initialization snapshots and unsubscribed JSX/TSX render calls. Explicit imports
use `configs.recommended` (Vanilla/React) or `configs.vue`; auto imports use the matching
`configs['vanilla-auto-import']`, `configs['vue-auto-import']`, or
`configs['react-auto-import']`.
In Vue, auto import removes the import statement but does not synthesize a template binding; call
`useI18n()` in `<script setup>` before using `t` in the template.
Destructuring `const { t } = useI18n()` does not break Vue reactivity: each template call reads the
adapter's Runtime revision. By contrast, `const label = t('Save')` stores only the current string;
call `t()` in the template or use the standalone Vue-only `tRef('Save')`. It returns a readonly
computed Ref and should be created in setup/composable code, not during template or render
evaluation. It also accepts a whole static message-only tree and preserves that tree's shape.

## Option rules

- `locales` is non-empty and locale values are unique.
- `sourceLang` occurs in `locales`.
- `defaultLang` defaults to `sourceLang`; omit it when both are equal. A non-source value also
  occurs in `locales`.
- `directory` defaults to `i18n` relative to Vite `root`.
- `persist` is false by default; `true` uses `ai-i18n:lang`, or pass `{ key }`.
- Missing translations always return source text.
- `provider` is optional; when present, its `translator` is required.
- `cache.maxMessages` and `cache.maxBytes` are optional positive integers.
- Cleanup defaults should remain unless explicitly changed.

Vite places no cap on static candidate expansion. The optional ESLint plugin warns when one `t()`
exceeds 1000 source/options combinations by default; configure its
`ai-i18n/static-candidate-limit` rule rather than adding a Vite option.

The complete field list, nested types (`LangOption`, `HtmlExtractorOptions`, etc.), and defaults
table live at `api/vite/interfaces/ai-i18n-options.md` in [SKILL.md](../SKILL.md)'s doc table; fetch
it before assuming an undocumented field's shape.

`defineI18nMessages<T>(value)` is independent of `autoImport`: it is an import-free compiler macro
declared in every generated `ai-i18n.d.ts`. Vite erases it to `(value)` in browser and SSR
transforms, while `aiI18nVitest()` applies the same erasure. A local binding with that name shadows
the macro. It must be called directly rather than assigned or passed as a runtime value. It accepts
any `T` and does not freeze, clone, validate, or execute collection members.

A whole static message-only object or array can instead be passed directly to `t(messages)`, or to
Vue `tRef(messages)`, without the macro or `as const`. Every string leaf is extracted and translated
while primitive non-string leaves are preserved. Use `defineI18nMessages()` only when passing a
member or finite dynamic index to `t()`. Whole-tree calls accept plain objects and arrays only and
do not support per-leaf comments or tagged-template interpolation.

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
  provider: {
    translator,
    batchLength: 12_000,
    maxConcurrency: 5,
  },
})
```

Keep secrets in Vite's Node process. `batchLength` measures serialized request length, not tokens.
`debounceMs` (default `100`, merges consecutive Dev misses) and `strict` (default `false`, throws on
`flush` when a translation failed or is still `null`) are also available; see
`api/vite/type-aliases/ai-i18n-provider-options.md` for the full Provider option table. The OpenAI
adapter sends structured `{ source, comment? }` rows to the
model; custom system prompts should describe translation requirements without redefining that input
or the appended output schema. For a custom adapter, import the public `Translator` type from
`@ai-i18n/vite`; do not add an internal package as a direct application dependency.

## Optional locale loading

```ts
aiI18n({
  sourceLang: 'zh-CN',
  locales,
  loading: {
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
failed `setLang()` keeps the current language. `getLangLoadState()` exposes an immutable
`idle` / `loading` / `error` snapshot. Vue and React `useI18n()` additionally returns
`langLoadState`, `isLangLoading`, and `langLoadError`. Concurrent-load Promise sharing and other
edge cases: see `api/vite/interfaces/ai-i18n-locale-loading-options.md`. Calls for the same locale
reuse the underlying loader request; their `setLang()` wrapper Promises are not guaranteed to be
reference-equal. Shared error state does not consume a rejected `setLang()` Promise; callers must
still terminate it with `try/catch` or `.catch()`.

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
`translations.json` serialization, not just the pruned messages — size it against the whole file.
`cleanup.orphanMessages: true` deletes all inactive messages first, ahead of these limits;
`cleanup.missingSourceFiles` separately decides whether missing source records still protect their
messages. The exact pruning order (a rare debugging detail): see
`api/vite/interfaces/ai-i18n-cache-options.md`.

## Generation behavior

Vite Dev accumulates browser-requested modules; visit lazy routes before judging coverage. Vite Build
starts a fresh state and follows reachable imports. Both modes reconcile stable `translations.json`,
`overrides.json`, `extracted/*.json`, and `locales/**`.

Commit `translations.json`, `overrides.json`, and the generated `ai-i18n.d.ts`. Ignore
`extracted/` and `locales/`; a full Build recreates both. Before first MCP use, after switching
branches, or after source/extractor configuration changes, run a full Build when extracted output is
missing, empty, or potentially stale. Dev only covers modules requested by the browser.

`translations.json` uses schema v1 and contains `version`, monotonic `revision`, and messages keyed
by readable message ID. Each message stores its `source`, `sourceLang`, optional comment, and target
translations. Provider and MCP translation tools target this file; `overrides.json` stores human
review values through separate MCP override tools.
Extracted v1 stores only source structure, and locales are derived. The normalized `comment`
participates in the message ID, so source or comment changes require translation; `#` and `\` are
escaped without collisions. When the source language changes, ai-i18n can uniquely reverse-match the new source
against a historical entry whose translation for the new source language equals it. Extracted files
are flat (for example, `src_components_App.tsx.json`), and locale files are generated only for
non-source targets.

`vite build --watch` creates ProjectState on the first build and reuses it on later rebuilds.
Unchanged source fingerprints reuse their AST; changed static dependencies refresh necessary reverse
dependents. Edits to `translations.json` or `overrides.json` update translations and registration
without parsing unchanged source. Effective precedence is exact comment-specific override, source default
override, then AI memory. Edits to extracted or target locale files are replaced from source
structure and the two translation inputs. Deleted, renamed, or newly unreachable modules leave the
active graph while Translation Memory remains available. Restart the Watch process after Vite config,
plugin, extractor, or schema changes.

SSR extraction, registration, and runtime injection are skipped with a warning, but compiler-macro
erasure still runs. The per-build reuse table (what exactly is re-parsed vs. reused) lives in
the user guide's `guide/basic/directory.md#dev-与-build` section.

For Vitest, use `aiI18nVitest(options)` from `@ai-i18n/vite/vitest`. Do not run the production plugin
or maintain a `virtual:ai-i18n` alias just for unit tests; see `guide/quality/testing.md` for the
shared-options pattern and test-environment capability scope. If production sets `autoImport: true`,
pass the same value to `aiI18nVitest()` so unbound mode-specific APIs are injected in tests too.
