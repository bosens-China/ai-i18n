---
name: use-ai-i18n-mcp
description: Use the six local ai-i18n MCP tools to inspect missing translations, update translations.json, and manage reviewed overrides.json values. Use when working with ai_i18n_list_translations, ai_i18n_set_translations, ai_i18n_clear_translations, ai_i18n_list_overrides, ai_i18n_set_overrides, or ai_i18n_delete_overrides, especially when a monorepo requires resolving one Vite app's i18n directory first.
---

# Use ai-i18n MCP

Use the locate → list → update → verify workflow. Do not scan for i18n directories or edit generated
files manually while the MCP tools are available.

`@ai-i18n/mcp` is a local stdio package. During prerelease, register it with
`npx -y @ai-i18n/mcp@alpha`; registration does not take a project path.

## Locate the target app

1. Identify the Vite app the user wants to change. In a monorepo, do not treat the repository root
   or a similarly named `i18n/` directory as the target.
2. Read the app's `package.json`, package scripts, and `vite.config.*` as text. Do not execute the
   Vite config.
3. Resolve Vite `root` from the command's working directory. Then resolve `aiI18n({ directory })`
   against that root; the default directory is `i18n`.
4. Pass the resulting absolute path as `i18n_directory`.

If more than one Vite app is plausible, ask the user which app to use before calling MCP.
The app's framework mode and `autoImport` setting affect source integration but do not change the MCP
directory contract. Do not add or remove Runtime imports as part of a translation-only MCP task.

The directory must contain `translations.json`, `overrides.json`, and `extracted/`. Run the target
app's full Vite Build before the first MCP use when `extracted/` is missing or empty. Build again
after switching branches or changing source or extraction configuration when the local result may be
stale. Prefer Build over Dev because Dev covers only browser-requested modules.

Keep the resolved i18n directory's `extracted/` and `locales/` subdirectories in `.gitignore`. For
complete generated-file and Git guidance, read
[Generated files and Git](https://bosens-china.github.io/ai-i18n/guide/basic/directory.md).

## Load the tool contract

Read [Tool contracts](references/tool-contracts.md) before the first MCP call. It defines message
identity, pagination, the six tool boundaries, batch behavior, and human review scopes.

Read [Error recovery](references/recovery.md) only when a tool is unavailable, protocol files are
missing or stale, or an MCP call returns an error.

## Execute the workflow

1. List missing translations with only the resolved `i18n_directory` on the first call.
2. Follow every page unless the user requested a sample or narrower scope.
3. Write ordinary translations without overwriting existing non-null values.
4. Clear automatic translations or change human review values only when the user explicitly requests
   or approves that action.
5. Repeat the matching list operation to verify the result.

Preserve product names, intentional whitespace, and every template token. Do not guess between
conflicting non-empty values.

## Report

Report the selected app and absolute i18n directory, added, overwritten, cleared or deleted, unchanged,
remaining, and failed counts. Explain unresolved errors in the user's language without exposing
internal message IDs.
