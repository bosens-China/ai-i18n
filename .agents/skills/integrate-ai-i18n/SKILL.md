---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite browser projects that use Vue 3, React 18+, or vanilla JavaScript and TypeScript. Use when installing or configuring @ai-i18n/vite, adding translation calls or virtual:ai-i18n imports, selecting framework mode, enabling auto imports or ESLint, configuring optional locale loading, or diagnosing an incomplete integration.
---

# Integrate ai-i18n

Preserve the project's package manager, Vite plugins, framework conventions, and configuration style.
Use one `@ai-i18n/vite` registration and one framework mode per Vite build.

## Inspect and decide scope

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework
plugin setup. Confirm that the app uses Vite 8 or newer and a browser runtime. ai-i18n does not support
SSR translation rendering.

In a monorepo, identify one target Vite build. Ask the user before editing when any material product
choice is not already configured or specified:

- source language, target languages, or default language;
- output directory or generated declaration path;
- explicit imports versus `autoImport: true`;
- automatic translation, manual review, locale loading, or cache cleanup.

Do not combine Vue and React in the same Vite build. Plain `.js` and `.ts` files use the mode of their
containing Vite build, not a mode inferred from their extension.

## Load only the needed reference

Always read [Vite configuration](references/vite.md). Then read exactly one framework reference:

- [Vue integration](references/vue.md) for Vue 3, Vue SFC, or Vue JSX/TSX;
- [React integration](references/react.md) for React JSX/TSX;
- [Vanilla integration](references/vanilla.md) when the build has neither Vue nor React plugins.

For a full option table or an edge case not covered by these files, fetch the current Markdown page
from the published docs. Start with `https://bosens-china.github.io/ai-i18n/llms.txt`; prefer the
installed package and local references if the deployed site conflicts with them.

## Apply the smallest complete setup

1. During prerelease, install `@ai-i18n/vite@alpha`. Do not add separate ai-i18n Vue or React packages.
2. Register one `aiI18n()` in the existing Vite `plugins` array.
3. Let the final Vite plugin list detect the framework. Set `framework` only for a custom setup that
   cannot be detected.
4. Keep explicit imports by default. Enable `autoImport: true` only when the user requests it.
5. Add one static translation call using the selected framework pattern.
6. For TypeScript, keep the generated `ai-i18n.d.ts` in a path included by `tsconfig.json`.
7. Run the target app's type check and a full Vite Build.
8. Commit source changes, generated declarations, `translations.json`, and `overrides.json`. Ignore
   `extracted/` and `locales/` because Build recreates them.

Add optional features only when the user requests them. Use the published documentation for Provider
setup, language chunking, cache limits, HTML extraction, ESLint rule options, and test configuration.

## Preserve translation behavior

- Put translatable text in `t()`. Ordinary strings, JSX text, Vue template text, and HTML are not
  translated automatically.
- Use a static `comment` only when wording needs context or semantic disambiguation.
- Use tagged templates for dynamic values. Preserve their placeholders in translated output.
- Pass a whole static message-only object or array directly to `t(messages)`; use
  `defineI18nMessages()` only when selecting a member or finite dynamic index.
- In Vue and React component render paths, use `useI18n()` and its `t`. Use top-level `t` only in
  ordinary modules, and evaluate it at call time instead of storing a translated snapshot.
- Vue and React auto-import mode also provides the base Runtime language APIs. Use `setLang()`,
  `getLang()`, `getLangs()`, `getLangLoadState()`, and `subscribe()` in ordinary modules, store
  actions, and router hooks that cannot use a framework subscription API.
- Treat `getLang()` and `getLangLoadState()` as call-time snapshots. For rendered framework state,
  use `currentLang` and `langLoadState` from `useI18n()`; for a long-lived non-component listener,
  keep and invoke the cleanup returned by `subscribe()`.
- In Vue setup or composables, use `tRef()` for a reactive predeclared label. Do not call `tRef()` in
  templates or render functions.
- Missing translations fall back to source text. Before judging translation coverage, run a full Build;
  Dev covers only modules requested by the browser.

## Verify and report

Check installation, resolved framework mode, Vite syntax, one runtime translation call, generated
declarations, the matching ESLint preset, and the output directory. When handing off to
`@ai-i18n/mcp`, provide the final absolute directory resolved from the target build's Vite `root` and
`aiI18n.directory`. MCP translation writes identify a shared message by its source and optional
static comment, not by a source file or an internal encoded message ID.

Report the selected app, changes made, commands run, remaining unsupported scope, and any decisions
that still need user input.
