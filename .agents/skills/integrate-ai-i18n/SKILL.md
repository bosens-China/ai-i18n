---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite browser projects and configure its static extraction runtime for Vue 3, React 18+, or vanilla JavaScript and TypeScript. Use when installing or registering @ai-i18n/vite, selecting or detecting a framework mode, enabling ai-i18n auto imports, importing virtual:ai-i18n or useI18n, enabling optional ESLint checks, configuring locale output directories and generated virtual-module types, migrating an existing Vite app, or diagnosing an incomplete ai-i18n setup.
---

# Integrate ai-i18n

Use one `@ai-i18n/vite` installation and one framework mode per Vite build. Preserve the
project's package manager, existing Vite plugins, framework conventions, and configuration style.

## Inspect before editing

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework
plugin setup. Determine:

- whether Vite is version 8 or newer;
- whether this build is Vanilla, Vue, or React;
- whether `unplugin-auto-import` is already registered;
- whether the runtime is browser-only or includes SSR;
- the source locale, target locales, default locale, and desired output directory;
- whether target locale assets should be preloaded, prefetched, or fully lazy;
- whether the project requires a bounded Translation Memory;
- whether an ai-i18n Provider already exists.

Do not combine Vue and React in one Vite build. Microfrontend repositories may use different modes
in separate child builds. ai-i18n currently supports Vite ≥ 8 and a browser runtime; surface the SSR
limitation when server-rendered translation is required.

## Load the relevant guidance

Always read [Vite configuration](references/vite.md). Then read only the matching framework reference:

- Vue 3, `.vue`, or Vue JSX/TSX: [Vue integration](references/vue.md)
- React JSX/TSX: [React integration](references/react.md)
- Plain `.js` or `.ts`: [Vanilla integration](references/vanilla.md)

## Fetch published docs for deeper detail

The reference files above cover the common setup. For exhaustive option tables, capacity/loading
edge cases, or narrative walkthroughs beyond what they cover, fetch the matching page below instead
of guessing. The docs site is built with Rspress SSG-MD, so every page also exists as clean Markdown
at the same path with a `.md` extension — fetch that, not the `.html` page:

| Topic | Page |
| --- | --- |
| Full `aiI18n()` option table, Provider tuning, capacity/loading edge cases | `https://bosens-china.github.io/ai-i18n/api/vite.md` |
| Runtime API (`t`, `useI18n`, template placeholders, persist/detect/fallback) | `https://bosens-china.github.io/ai-i18n/api/runtime.md` |
| Protocol directory layout, Git conventions, message-ID/comment migration | `https://bosens-china.github.io/ai-i18n/guide/advanced/workflow.md` |
| AI translation Provider setup and prompt tuning | `https://bosens-china.github.io/ai-i18n/guide/advanced/ai-translation.md` |
| `aiI18nVitest()` usage | `https://bosens-china.github.io/ai-i18n/guide/advanced/testing.md` |
| ESLint plugin Flat Config examples per framework | `https://bosens-china.github.io/ai-i18n/guide/basic/eslint.md` |

If a link 404s after a docs restructure, fetch `https://bosens-china.github.io/ai-i18n/llms.txt` (a
generated site index) to relocate the page. These pages reflect the latest deploy from `main` and can
lag an unreleased repository state; when a fetched page conflicts with this skill or the installed
package version, trust the reference files and the installed code over a stale fetch.

## Implement the smallest complete setup

1. While the package is prerelease, install `@ai-i18n/vite@alpha`; do not rely on the older
   `latest` dist-tag and do not add separate ai-i18n Vue or React packages.
2. Register one `aiI18n()` in the existing Vite `plugins` array.
3. Let the final Vite plugin list infer the mode, or set `framework` only when an explicit override is required.
4. Let an existing `unplugin-auto-import` enable ai-i18n auto imports, or set `autoImport: true/false`
   to force the behavior.
5. Ensure `sourceLang` and a non-source `defaultLang` occur in the unique, non-empty `locales`
   array. Omit `defaultLang` when it equals `sourceLang`.
6. Add one static translation call. Explicit imports always come from `virtual:ai-i18n`; auto-import
   users write the same API without the import statement.
7. For TypeScript, keep the generated `src/ai-i18n.d.ts` in the project or configure `dts` to another
   included path. The generated file carries noformat, ts-nocheck, and eslint-disable markers; do
   not hand-maintain or reformat duplicate global declarations.
8. Run the app's type check and Vite build, then confirm the messages-only cache v2,
   flat `extracted/*.json`, and target-only `locales/*.json` under the resolved output directory.

When the user requests smaller initial bundles, configure `loading: { strategy: 'locale' }`.
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

The external Auto Import plugin is only the default opt-in signal for ai-i18n. ai-i18n performs its
own import injection, so do not add `useI18n` or the Vanilla runtime APIs to the external plugin's
`imports` configuration.

Do not add a translator, model, API key, HTML extraction, cache limit, cleanup override, Vue plugin,
or React provider unless the project requires it. When automatic translation is requested, keep
secrets in the Node-side translator closure and follow [Vite configuration](references/vite.md).

## ESLint

Add `@ai-i18n/eslint-plugin@alpha` during prerelease only when checks are requested or auto-imported
globals must be declared.
Use exactly one of `configs.vanilla`, `configs.vue`, or `configs.react`, matching the resolved Vite
mode. Preserve the host Vue parser and framework lint rules. The host Auto Import plugin remains
responsible for ESLint declarations of its own APIs. For per-framework Flat Config examples, fetch
the ESLint doc page from the table above.

## Preserve extraction semantics

- Ordinary strings, JSX text, Vue text, and mixed HTML fragments are not guessed.
- Prefer `t(source)` for ordinary copy. The optional second `comment` is only for
  translation guidance; it is metadata and does not participate in the message ID. Changing it
  preserves translations. Do not invent comments by default. Source and comment arguments must be
  statically evaluable.
- For object or array copy, use the import-free compiler macro
  `const messages = defineI18nMessages({...})`, then pass members such as
  `messages.save` or `messages.states[index]` to `t()`. The macro is an analysis marker that must be
  called directly, not assigned or passed as a runtime value. It is not a freeze/validation helper;
  Vite erases it to the original argument. Do not replace direct literals
  with concatenation or logical expressions merely because the analyzer can recover candidates.
- Use tagged templates for dynamic values: `` t`你好 ${name}` ``. Expressions are represented as
  reorderable `{{0}}`, `{{1}}` placeholders and are not translated.
- Vue/React Hook bindings work in JS, TS, JSX, and TSX, including composables and custom Hooks.
- Vue SFC extraction respects compiler-sfc bindings and template-local scopes.
- Vue JSX/TSX is supported in Vue mode when `@vitejs/plugin-vue-jsx` is present.
- Missing targets are `null`; runtime lookup falls back to source text.
- Optional `persist`, `detect: 'navigator'`, and `fallback` configure browser preference and missing
  translation UX. Persisted locale wins over navigator detection, which wins over `defaultLang`.
- Commit source, generated `ai-i18n.d.ts`, `cache.json`, `extracted/**`, and `locales/**` together.

## Vitest

Use `aiI18nVitest()` from `@ai-i18n/vite/vitest` in the Vitest config instead of the production
`aiI18n()` or a hand-written alias. Pass the same source/default locales and keep the host React/Vue
Vite plugin. The test plugin resolves `virtual:ai-i18n` with source fallback and framework Hooks but
does not extract, call a Provider, or write protocol files.
It still erases `defineI18nMessages()` so test modules need no macro import or mock.

## Verify and report

Check package installation, resolved framework mode, resolved auto-import behavior, Vite config syntax,
generated declarations, ESLint globals when applicable, one runtime call, and generated protocol
files. When handing the project to `@ai-i18n/mcp`, call `ai_i18n_discover` first and use its absolute
directory result; MCP registration itself takes no project path. State explicitly when SSR, dynamic messages,
unvisited Dev routes, or Build-unreachable modules remain outside the verified scope.
