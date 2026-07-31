---
name: integrate-ai-i18n
description: Integrate ai-i18n into Vite browser projects that use Vue 3, React 18+, or vanilla JavaScript and TypeScript. Use when installing or configuring @ai-i18n/vite, adding translation calls or virtual:ai-i18n imports, selecting framework mode, enabling auto imports or ESLint, configuring optional locale loading, or diagnosing an incomplete integration.
---

# Integrate ai-i18n

Preserve the project's package manager, Vite plugins, framework conventions, and configuration style.
Use one `@ai-i18n/vite` registration and one framework mode per Vite build.

## Inspect the target build

Read the target app's `package.json`, `vite.config.*`, TypeScript config, entry files, and framework
plugin setup. Confirm that the app uses Vite 8 or newer and a browser runtime. ai-i18n does not support
SSR translation rendering.

In a monorepo, identify one target Vite build. Ask the user only when more than one app is plausible,
or when a new setup has no source and target language decision that can be inferred from existing
configuration. Preserve configured values.

Do not combine Vue and React in the same Vite build. Supported framework-neutral ESM modules use the
mode of their containing Vite build, not a mode inferred from their extension.

Do not enable optional behavior by default. Keep explicit imports and omit automatic translation,
automatic imports, language persistence, locale loading, cache cleanup, HTML extraction, ESLint, and
test integration unless the user requests them. Do not remove an optional feature that is already
configured.

## Load only the needed references

Always read:

- [Vite configuration](references/vite.md);
- [Translation and runtime rules](references/messages.md);
- exactly one framework reference:

  - [Vue integration](references/vue.md) for Vue 3, Vue SFC, or Vue JSX/TSX;
  - [React integration](references/react.md) for React JSX/TSX;
  - [Vanilla integration](references/vanilla.md) when the build has neither Vue nor React plugins.

Read [Optional features](references/optional-features.md) only when the user explicitly requests one
of those features.

## Apply the smallest complete setup

1. During prerelease, install `@ai-i18n/vite@alpha`. Do not add separate ai-i18n Vue or React packages.
2. Register one `aiI18n()` in the existing Vite `plugins` array.
3. Let the final Vite plugin list detect the framework. Set `framework` only for a custom setup that
   cannot be detected.
4. Keep explicit imports by default. Enable `autoImport: true` only when the user requests it.
5. Add one static translation call using the selected framework pattern.
6. For TypeScript, keep the generated `ai-i18n.d.ts` in a path included by `tsconfig.json`.
7. Run the target app's type check and a full Vite Build.

Keep the resolved i18n directory's `extracted/` and `locales/` subdirectories in `.gitignore`. For
complete generated-file and Git guidance, read
[Generated files and Git](https://bosens-china.github.io/ai-i18n/guide/basic/directory.md).

## Verify and report

Check installation, resolved framework mode, Vite syntax, one runtime translation call, generated
declarations, and the output directory. Verify optional features only when they were requested or
already configured.

Report the selected app, changes made, commands run, remaining unsupported scope, and any decisions
that still need user input.
