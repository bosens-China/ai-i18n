---
name: use-ai-i18n-mcp
description: Use the eight local ai-i18n MCP tools to inspect missing or orphaned translations, update the configured JSON or SQLite Translation Memory, and manage reviewed overrides.json values. Use when working with ai_i18n_list_translations, ai_i18n_set_translations, ai_i18n_clear_translations, ai_i18n_list_orphan_messages, ai_i18n_delete_orphan_messages, ai_i18n_list_overrides, ai_i18n_set_overrides, or ai_i18n_delete_overrides, especially when a monorepo requires resolving one Vite app's i18n directory first.
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
When package installation, Vite configuration, or Runtime source integration is incomplete or
requested, use the `integrate-ai-i18n` Skill before starting this translation workflow.

The selected app's extracted set includes every reachable local workspace source processed by that
Vite build. Treat source-only packages as `source_files` within the consuming app, not as separate MCP
targets. Never point two Vite builds at one i18n directory; call the tools once per selected app.
Use tool-returned `source_file` values; never decode or guess a source path from a physical filename.

The directory must contain `overrides.json`, `extracted/`, and the Translation Memory selected by
`storage.json`. JSON uses deterministic shards under `translations/`; SQLite uses one user-level
database outside the repository. Never locate, open, or edit that database directly—the tools resolve
the current project binding from the i18n directory. Run the target app's full Vite Build before the
first MCP use when `extracted/` is missing or empty. Build again
after switching branches or changing source or extraction configuration when the local result may be
stale. Prefer Build over Dev because Dev covers only browser-requested modules.

Ignore Vite `provider.cache` when operating MCP tools. It controls only one Vite process's Provider
requests and never changes Agent list, write, clear, or orphan behavior.

Messages that exist only in `.cjs`, `.cts`, or CommonJS source do not enter `extracted/`. Do not
diagnose their absence as stale MCP data or attempt an MCP write for them; report the unsupported
source and require migration to supported browser ESM source before rebuilding.

Keep the resolved i18n directory's `extracted/` and `locales/` subdirectories in `.gitignore`. For
complete generated-file and Git guidance, read
[Generated files and Git](https://bosens-china.github.io/ai-i18n/guide/basic/directory.md).

## Load the tool contract

Read [Tool contracts](references/tool-contracts.md) before the first MCP call. It defines message
identity, pagination, the eight tool boundaries, batch behavior, orphan cleanup authorization, and
human review scopes.

Read [Error recovery](references/recovery.md) only when a tool is unavailable, protocol files are
missing or stale, or an MCP call returns an error.

## Execute the workflow

1. List missing translations with only the resolved `i18n_directory` on the first call.
2. Follow every page unless the user requested a sample or narrower scope.
3. Write ordinary translations without overwriting existing non-null values.
4. Clear automatic translations or change human review values only when the user explicitly requests
   or approves that action.
5. Repeat the matching list operation to verify the result.

Do not list or delete orphan messages during ordinary translation, review, or verification work. Enter
the orphan workflow only when the user explicitly requests an orphan audit or cleanup. Run one full
Build first, list every requested orphan, report the retained translations, and obtain explicit user
approval before deleting the listed IDs. Do not treat an earlier general cleanup request as approval
after the list changes or a selected message becomes active again.

Preserve product names, intentional whitespace, and every template token. Do not guess between
conflicting non-empty values.

List items omit `source_files` by default. Keep that compact response for translation work; request
`include_source_files: true` only when the user needs per-file impact or when an exact file filter must
be prepared. When a tool fails, follow its returned `next_action` before consulting the recovery
reference.

## Report

Report the selected app and absolute i18n directory, added, overwritten, cleared or deleted, unchanged,
remaining, and failed counts. Explain unresolved errors in the user's language without exposing
internal message IDs.
