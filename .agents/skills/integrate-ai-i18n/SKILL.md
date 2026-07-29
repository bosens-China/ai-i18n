---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite browser projects and configure its static extraction runtime for Vue 3, React 18+, or vanilla JavaScript and TypeScript. Use when installing or registering @ai-i18n/vite, selecting or detecting a framework mode, enabling ai-i18n auto imports, importing virtual:ai-i18n or useI18n, enabling optional ESLint checks, configuring locale output directories and generated virtual-module types, or diagnosing an incomplete ai-i18n setup.
---

# Integrate ai-i18n

Use one `@ai-i18n/vite` installation and one framework mode per Vite build. Preserve the
project's package manager, existing Vite plugins, framework conventions, and configuration style.

## Inspect before editing

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework
plugin setup. Determine:

- whether Vite is version 8 or newer;
- whether this build is Vanilla, Vue, or React;
- whether the user wants explicit imports or ai-i18n auto imports;
- whether the runtime is browser-only or includes SSR;
- the source locale, target locales, default locale, and desired output directory;
- whether target locale assets should be preloaded, prefetched, or fully lazy;
- whether the project requires a bounded Translation Memory;
- whether an ai-i18n Provider already exists.

Do not combine Vue and React in one Vite build. Microfrontend repositories may use different modes
in separate child builds. ai-i18n currently supports Vite ≥ 8 and a browser runtime; surface the SSR
limitation when server-rendered translation is required.

## Load the relevant guidance

Always read [Vite configuration](references/vite.md). Then read the reference matching the whole
Vite build, not the extension of the file currently being edited:

- Vue 3, `.vue`, or Vue JSX/TSX: [Vue integration](references/vue.md)
- React JSX/TSX: [React integration](references/react.md)
- A build without Vue or React plugins: [Vanilla integration](references/vanilla.md)

Plain `.js` / `.ts` files inside a Vue or React build still use that build's framework mode. They
may import top-level Runtime functions when they cannot call a Hook.

## Fetch published docs for deeper detail

The reference files above cover the common setup. For exhaustive option tables, capacity/loading
edge cases, or narrative walkthroughs beyond what they cover, fetch the matching page below instead
of guessing. The docs site is built with Rspress SSG-MD, so every page also exists as clean Markdown
at the same path with a `.md` extension — fetch that, not the `.html` page:

| Topic | Page |
| --- | --- |
| Full `aiI18n()` option table | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/ai-i18n-options.md` |
| Provider tuning | `https://bosens-china.github.io/ai-i18n/api/vite/type-aliases/ai-i18n-provider-options.md` |
| Locale loading edge cases | `https://bosens-china.github.io/ai-i18n/api/vite/interfaces/ai-i18n-locale-loading-options.md` |
| Runtime API availability | `https://bosens-china.github.io/ai-i18n/api/runtime/overview.md` |
| `t()` and template placeholders | `https://bosens-china.github.io/ai-i18n/api/runtime/functions/t.md` |
| `useI18n()` | `https://bosens-china.github.io/ai-i18n/api/runtime/framework-api/use-i18n.md` |
| Vue `tRef()` | `https://bosens-china.github.io/ai-i18n/api/runtime/framework-api/t-ref.md` |
| `getLangLoadState()` | `https://bosens-china.github.io/ai-i18n/api/runtime/functions/get-lang-load-state.md` |
| Static extraction scope, recommended syntax, and AST limits | `https://bosens-china.github.io/ai-i18n/guide/basic/static-analysis.md` |
| ai-i18n auto imports and generated declarations | `https://bosens-china.github.io/ai-i18n/guide/basic/auto-import.md` |
| Locale chunking, lazy loading, and UI loading state | `https://bosens-china.github.io/ai-i18n/guide/basic/locale-loading.md` |
| Protocol directory layout, Git conventions, and message-ID/comment behavior | `https://bosens-china.github.io/ai-i18n/guide/basic/directory.md` |
| AI translation Provider setup and prompt tuning | `https://bosens-china.github.io/ai-i18n/guide/advanced/ai-translation.md` |
| `aiI18nVitest()` usage | `https://bosens-china.github.io/ai-i18n/guide/quality/testing.md` |
| ESLint plugin Flat Config examples per framework | `https://bosens-china.github.io/ai-i18n/guide/quality/eslint.md` |
| Common integration questions and troubleshooting | `https://bosens-china.github.io/ai-i18n/guide/faq.md` |

If a link 404s after a docs restructure, fetch `https://bosens-china.github.io/ai-i18n/llms.txt` (a
generated site index) to relocate the page. These pages reflect the latest deploy from `main` and can
lag an unreleased repository state; when a fetched page conflicts with this skill or the installed
package version, trust the reference files and the installed code over a stale fetch.

When reporting installation failures involving `fs-native-extensions`, Alpine/musl, or
`ADDON_NOT_FOUND`, fetch the Markdown FAQ URL above.

## Implement the smallest complete setup

1. While the package is prerelease, install `@ai-i18n/vite@alpha`; do not rely on the older
   `latest` dist-tag and do not add separate ai-i18n Vue or React packages.
2. Register one `aiI18n()` in the existing Vite `plugins` array.
3. Let the final Vite plugin list infer the mode, or set `framework` only when an explicit override is required.
4. Keep explicit imports by default. Set `autoImport: true` only when the user explicitly requests
   ai-i18n auto imports; other Vite plugins never enable it.
5. Ensure `sourceLang` and a non-source `defaultLang` occur in the unique, non-empty `locales`
   array. Omit `defaultLang` when it equals `sourceLang`.
6. Add one static translation call. Explicit imports always come from `virtual:ai-i18n`; auto-import
   users write the same API without the import statement.
7. For TypeScript, keep the generated `src/ai-i18n.d.ts` in the project or configure `dts` to another
   included path. The generated file carries noformat, ts-nocheck, and eslint-disable markers; do
   not hand-maintain or reformat duplicate global declarations.
8. Run the app's type check and Vite build, then confirm schema-v1 `translations.json`,
   `overrides.json`, flat translation-free `extracted/*.json`, and target-only `locales/*.json`
   under the resolved output directory.

When the user requests smaller initial bundles, configure `loading: {}`.
Use `preload` only for target locales expected immediately, `prefetch` for likely later choices, and
leave other targets fully lazy. Never list the source locale. A non-source `defaultLang` is
automatically preloaded and temporarily renders source fallback until its locale module loads.

When the project uses `vite build --watch`, expect the first build to create ProjectState and later
builds to reuse unchanged analysis. Restart the Watch process after Vite config, plugin, extractor,
or schema changes.

Configure `cache.maxMessages` or `cache.maxBytes` only when the user requests a bounded Translation
Memory. Both are positive integers. The limits are disabled by default and only prune inactive
history in stable message-ID order. Active messages remain protected; if they exceed a configured
limit, Vite warns and keeps them. `cleanup.orphanMessages: true` is stronger and removes all inactive
messages before capacity enforcement.

ai-i18n auto imports are self-contained and disabled by default. When explicitly enabled, ai-i18n
injects only its fixed mode-specific Runtime APIs. React injects `useI18n` and top-level `t`; Vue
also injects `tRef`. Use `useI18n()` in component render paths for reactive updates and top-level `t` in ordinary
modules that cannot call it. In Vue `<script setup>`, destructuring
`const { t } = useI18n()` remains reactive when the template calls `t()`. Storing an eager result
such as `const label = t('Save')` does not; use the template call or the Vue-only standalone
`const label = tRef('Save')`. `tRef()` returns a readonly `ComputedRef<string>` and must be created
once in setup/composable code, never called during template or render evaluation.

Do not add a translator, model, API key, HTML extraction, cache limit, cleanup override, Vue plugin,
or React provider unless the project requires it. When automatic translation is requested, keep
secrets in the Node-side translator closure and follow [Vite configuration](references/vite.md).

## ESLint

Add `@ai-i18n/eslint-plugin@alpha` during prerelease only when checks are requested or auto-imported
globals must be declared.
With explicit Runtime imports, use `configs.recommended` for Vanilla/React or `configs.vue` for Vue
SFC coverage. With `aiI18n({ autoImport: true })`, instead use exactly one of
`configs['vanilla-auto-import']`, `configs['vue-auto-import']`, or
`configs['react-auto-import']`, matching the resolved Vite mode. Only auto-import presets declare
Runtime globals. Preserve the host Vue parser and framework lint rules. For per-framework Flat
Config examples, fetch the ESLint doc page from the table above. All presets warn through
`ai-i18n/no-eager-translation` when initialization stores a translated string instead of evaluating
it in a function or getter. A Vue SFC's directly exported options object is also a one-time
initialization boundary. Imported Vue `defineComponent()` object and function signatures receive
the same check in `.vue`, `.ts`, and `.tsx` files. Vue and React presets also warn through
`ai-i18n/no-unsubscribed-t` when JSX/TSX render code uses Runtime top-level `t` instead of the
subscribed Hook/composable value; the explicit-import `recommended` preset applies the same JSX/TSX
check. It also reports Vue `tRef()` calls made during template or JSX/TSX rendering, because those
calls create a new computed on every render. Event callbacks and standalone `console.log` / `warn` / `error` / `info` / `debug` calls
remain valid; unknown calls still warn because they may retain the translated value. These rules
intentionally do not follow arbitrary cross-function or cross-file data flow and have no autofix.
In Vue auto-import mode, a bare template-only `t` is an error: auto import removes the import
statement but does not synthesize `const { t } = useI18n()` or a component subscription.

Presets also warn when one `t()` expands beyond 1000 static source/options combinations. Change
`ai-i18n/static-candidate-limit`'s positive-integer `maxStaticCandidates` option only in ESLint
config; Vite extraction has no candidate cap or matching plugin option.

## Preserve extraction semantics

- Ordinary strings, JSX text, Vue text, and mixed HTML fragments are not guessed.
- Prefer `t(source)` for ordinary copy. Pass `{ comment: '...' }` only when translation guidance or
  semantic disambiguation is needed. The normalized comment participates in the internal message ID,
  so changing source or comment creates a new untranslated message. `#` and `\` are escaped
  collision-free; do not invent or pass a separate ID. Source and options must be statically
  evaluable.
- For object or array copy, use the import-free compiler macro
  `const messages = defineI18nMessages({...})`, then pass members such as
  `messages.save` or `messages.states[index]` to `t()`. The macro is an analysis marker that must be
  called directly, not assigned or passed as a runtime value. It is not a freeze/validation helper;
  Vite erases it to the original argument. Do not replace direct literals
  with concatenation or logical expressions merely because the analyzer can recover candidates.
- Use tagged templates for dynamic values: `` t`你好 ${name}` ``. Expressions are represented as
  reorderable `{{0}}`, `{{1}}` placeholders and are not translated. Placeholder-shaped source text
  is escaped internally (`{{0}}` becomes `{{=0}}`) and is restored before display. Runtime logs a
  console warning when translation placeholders differ, then continues using that translation.
- Vue/React Hook bindings work in JS, TS, JSX, and TSX, including composables and custom Hooks.
- Vue `tRef()` is a direct `virtual:ai-i18n` import, not a `useI18n()` field. It shares the same
  static source/options extraction rules as `t()` and returns a readonly computed Ref.
- Plain JS/TS modules in a Vue or React build may import top-level `t`; translate at call time rather
  than caching its result. A component still needs `useI18n()` to subscribe to Runtime updates.
- Vite does not cap static candidate expansion. ESLint warns per expression above its default 1000
  source/options combinations; raise that rule threshold only for a known finite collection.
- Vue SFC extraction respects compiler-sfc bindings and template-local scopes.
- Vue JSX/TSX is supported in Vue mode when `@vitejs/plugin-vue-jsx` is present.
- Missing targets are `null`; runtime lookup falls back to source text.
- Optional `persist` stores browser preference. A valid persisted locale wins over `defaultLang`.
  Missing translations always return source text.
- Persist semantic codes, counters, and stable filenames rather than translated strings. Translate at
  the display boundary; never parse localized output for identifiers, storage state, or numbering.
- Commit source, generated `ai-i18n.d.ts`, `translations.json`, `overrides.json`, `extracted/*.json`,
  and `locales/**` together.

## Vitest

Use `aiI18nVitest()` from `@ai-i18n/vite/vitest` in the Vitest config instead of the production
`aiI18n()` or a hand-written alias. Pass the same source/default locales and keep the host React/Vue
Vite plugin. Pass the same `autoImport` value when production enables it. The test plugin resolves
`virtual:ai-i18n` with source fallback and framework Hooks, and injects the same mode-specific APIs
when enabled, but does not extract, call a Provider, or write protocol files.
It still erases `defineI18nMessages()` so test modules need no macro import or mock.

## Verify and report

Check package installation, resolved framework mode, resolved auto-import behavior, Vite config syntax,
generated declarations, ESLint globals when applicable, one runtime call, and generated protocol
files. When handing the project to `@ai-i18n/mcp`, provide the final absolute directory resolved from
the target build's Vite `root` plus `aiI18n.directory`; the MCP server does not scan for it. In a
monorepo, identify one target Vite build at a time and account for the package script's working
directory when `root` is omitted. MCP registration itself takes no project path. The first
`ai_i18n_list_translations` call should omit `source_files`; it discovers exact source paths and
returns missing messages by default. Translation updates use the dedicated set/clear tools, while
human review uses the dedicated override list/set/delete tools; there is no shared `mode` parameter.
State explicitly when SSR, dynamic messages, unvisited Dev routes, or Build-unreachable modules
remain outside the verified scope.
