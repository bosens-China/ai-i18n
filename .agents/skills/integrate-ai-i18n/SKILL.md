---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite 8 browser projects and configure its static extraction runtime for Vue 3, React 18/19, or vanilla JavaScript and TypeScript. Use when installing or registering @ai-i18n/vite, adding framework extractors, importing virtual:ai-i18n or useI18n, enabling optional ESLint static checks, configuring locale output directories and virtual-module types, migrating an existing Vite app, or diagnosing an incomplete ai-i18n setup.
---

# Integrate ai-i18n

Add only the packages and extractor required by the target application. Preserve the project's package manager, existing Vite plugins, framework conventions, and configuration style.

## Inspect before editing

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework plugin setup. Determine:

- whether Vite is version 8;
- whether the app is Vue, React, mixed-framework, or Vanilla;
- whether the runtime is browser-only or includes SSR;
- the source locale, target locales, default locale, and desired output directory;
- whether an ai-i18n Provider already exists.

ai-i18n currently supports Vite 8 and a browser runtime. If the requested path depends on SSR translation, stop and surface that limitation instead of presenting the client stub as full SSR support.

## Load the relevant guidance

Always read [Vite configuration](references/vite.md). Then read only the references that match the application:

- Vue 3 or `.vue`: [Vue integration](references/vue.md)
- React or JSX/TSX: [React integration](references/react.md)
- Plain `.js` or `.ts`: [Vanilla integration](references/vanilla.md)

For a mixed Vue/React app, read both framework references and register both extractors in one `aiI18n()` instance. Never create one ai-i18n project state per framework.
If both frameworks author JSX/TSX, do not require framework-specific filenames. Let React handle
the unmatched default and give the Vue JSX plugin an explicit include glob for its files. A single
file must never be compiled by both runtimes. ai-i18n distinguishes Hooks by their import binding.

## Implement the smallest complete setup

1. Install `@ai-i18n/vite` plus only the framework binding needed by the app. Reuse existing Vite framework plugins and compilers.
2. Register one `aiI18n()` in the existing Vite `plugins` array. Add the selected extractor functions to its `extractors` option.
3. Ensure `sourceLang` and `defaultLang` are locale values present in the unique, non-empty `locales` array.
4. Add one explicit static `t('source', 'optional comment')` call through the correct runtime or framework hook.
5. For TypeScript, expose the `virtual:ai-i18n` declaration through `@ai-i18n/vite/client`.
6. Run the app's type check and Vite build, or a bounded Dev verification, and confirm that `cache.json`, `extracted/**`, and `locales/**` appear under the resolved output directory.

Do not add a translator, model, API key, HTML extraction, cleanup override, global store, Vue plugin installation, or React provider unless the project actually requires it.

When automatic AI translation is requested, keep model/network configuration inside the
`openAI()` translator closure and batching inside `aiI18n({ provider })`; follow the defaults and
local-service rules in [Vite configuration](references/vite.md). Never serialize API or LangSmith
keys into browser modules or generated protocol files.

## Add ESLint checks only when requested

- Install only `@ai-i18n/eslint-plugin` for ai-i18n semantics and expand `configs.recommended`.
- For `.vue` files, preserve the host's `vue-eslint-parser` setup and additionally expand `configs.vue`.
- Do not enable `configs.vue` for React or Vanilla projects, and do not treat React Hooks, React Refresh, or general Vue rules as part of ai-i18n.
- The shared rule checks static `t()` arguments; it does not replace Vite extraction or generate protocol files.

## Preserve extraction semantics

- Use explicit `t()` calls; ordinary strings, Vue text nodes, JSX text, and mixed HTML fragments are not guessed.
- Keep the source and optional comment statically evaluable. Dynamic arguments produce warnings and are not extracted.
- JS/TS/JSX/TSX enter the shared analyzer independently of framework syntax transforms. Registering a Vue or React extractor enables its Hook binding across that graph, including composables and custom Hooks. Destructured aliases and `const i18n = useI18n(); i18n.t()` are supported.
- Vue SFC extraction follows compiler-sfc bindings and local template scopes. External `<script src>` content is extracted under the external JS/TS file, not the `.vue` wrapper.
- Treat an unbound `undefined` comment as omitted. An unresolved imported constant remains pending and also emits a warning until its dependency is analyzed.
- Treat the optional comment as message identity and disambiguation, not translator-only prose.
- Expect missing targets to be stored as `null` and runtime lookup to fall back to source text.
- Commit `cache.json`, `extracted/**`, and `locales/**` together after Vite has reconciled them.

## Verify and report

Check package installation, Vite config syntax, virtual-module typing, one runtime translation call, and generated protocol files. State explicitly when SSR, dynamic messages, untranslated routes not visited in Dev, or modules unreachable from Build remain outside the verified scope.
