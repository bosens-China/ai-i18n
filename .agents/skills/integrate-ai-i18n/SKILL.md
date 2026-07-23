---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite 8 browser projects and configure its static extraction runtime for Vue 3, React 18/19, or vanilla JavaScript and TypeScript. Use when installing or registering @ai-i18n/vite, selecting or detecting a framework mode, enabling ai-i18n auto imports, importing virtual:ai-i18n or useI18n, enabling optional ESLint checks, configuring locale output directories and generated virtual-module types, migrating an existing Vite app, or diagnosing an incomplete ai-i18n setup.
---

# Integrate ai-i18n

Use one `@ai-i18n/vite` installation and one framework mode per Vite build. Preserve the
project's package manager, existing Vite plugins, framework conventions, and configuration style.

## Inspect before editing

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework
plugin setup. Determine:

- whether Vite is version 8;
- whether this build is Vanilla, Vue, or React;
- whether `unplugin-auto-import` is already registered;
- whether the runtime is browser-only or includes SSR;
- the source locale, target locales, default locale, and desired output directory;
- whether an ai-i18n Provider already exists.

Do not combine Vue and React in one Vite build. Microfrontend repositories may use different modes
in separate child builds. ai-i18n currently supports Vite 8 and a browser runtime; surface the SSR
limitation when server-rendered translation is required.

## Load the relevant guidance

Always read [Vite configuration](references/vite.md). Then read only the matching framework reference:

- Vue 3, `.vue`, or Vue JSX/TSX: [Vue integration](references/vue.md)
- React JSX/TSX: [React integration](references/react.md)
- Plain `.js` or `.ts`: [Vanilla integration](references/vanilla.md)

## Implement the smallest complete setup

1. Install `@ai-i18n/vite`; do not add separate ai-i18n Vue or React packages.
2. Register one `aiI18n()` in the existing Vite `plugins` array.
3. Let the final Vite plugin list infer the mode, or set `framework` only when an explicit override is required.
4. Let an existing `unplugin-auto-import` enable ai-i18n auto imports, or set `autoImport: true/false`
   to force the behavior.
5. Ensure `sourceLang` and `defaultLang` occur in the unique, non-empty `locales` array.
6. Add one static translation call. Explicit imports always come from `virtual:ai-i18n`; auto-import
   users write the same API without the import statement.
7. For TypeScript, keep the generated `src/ai-i18n.d.ts` in the project or configure `dts` to another
   included path. Do not hand-maintain duplicate global declarations.
8. Run the app's type check and Vite build, then confirm `cache.json`, `extracted/**`, and `locales/**`
   under the resolved output directory.

The external Auto Import plugin is only the default opt-in signal for ai-i18n. ai-i18n performs its
own import injection, so do not add `useI18n` or the Vanilla runtime APIs to the external plugin's
`imports` configuration.

Do not add a translator, model, API key, HTML extraction, cleanup override, Vue plugin, or React
provider unless the project requires it. When automatic translation is requested, keep secrets in
the Node-side translator closure and follow [Vite configuration](references/vite.md).

## ESLint

Add `@ai-i18n/eslint-plugin` only when checks are requested or auto-imported globals must be declared.
Use exactly one of `configs.vanilla`, `configs.vue`, or `configs.react`, matching the resolved Vite
mode. Preserve the host Vue parser and framework lint rules. The host Auto Import plugin remains
responsible for ESLint declarations of its own APIs.

## Preserve extraction semantics

- Ordinary strings, JSX text, Vue text, and mixed HTML fragments are not guessed.
- Source and optional comment arguments must be statically evaluable.
- Vue/React Hook bindings work in JS, TS, JSX, and TSX, including composables and custom Hooks.
- Vue SFC extraction respects compiler-sfc bindings and template-local scopes.
- Vue JSX/TSX is supported in Vue mode when `@vitejs/plugin-vue-jsx` is present.
- Missing targets are `null`; runtime lookup falls back to source text.
- Commit `cache.json`, `extracted/**`, and `locales/**` together.

## Verify and report

Check package installation, resolved framework mode, resolved auto-import behavior, Vite config syntax,
generated declarations, ESLint globals when applicable, one runtime call, and generated protocol
files. State explicitly when SSR, dynamic messages, unvisited Dev routes, or Build-unreachable modules
remain outside the verified scope.
