---
name: use-ai-i18n-mcp
description: Use the eight local ai-i18n MCP tools to inspect missing or orphaned translations, update project Translation Memory JSON shards, and manage reviewed override shards. Use when working with ai_i18n_list_translations, ai_i18n_set_translations, ai_i18n_clear_translations, ai_i18n_list_orphan_messages, ai_i18n_delete_orphan_messages, ai_i18n_list_overrides, ai_i18n_set_overrides, or ai_i18n_delete_overrides, especially when a monorepo requires resolving one Vite app's i18n directory first.
---

# Use ai-i18n MCP

Use the locate → list → update → verify workflow. Do not scan for i18n directories or edit generated
files manually while the MCP tools are available.

## Read the right source

For user-facing registration, product behavior, generated-file guidance, or integration
troubleshooting, read `https://bosens-china.github.io/ai-i18n/llms.txt` and then the one relevant page.
Do not load `llms-full.txt` by default or duplicate that guidance in this Skill.

For MCP calls, read [Tool contracts](references/tool-contracts.md) before the first call. It is the
Agent-only authority for message identity, inputs, pagination, batch behavior, write boundaries, and
authorization. Read [Error recovery](references/recovery.md) only after a returned `next_action` is
insufficient or when a tool or protocol file is unavailable.

## Locate the target app

1. Identify the Vite app the user wants to change. In a monorepo, do not treat the repository root
   or a similarly named `i18n/` directory as the target.
2. Read the app's `package.json`, package scripts, and `vite.config.*` as text. Do not execute the
   Vite config.
3. Resolve Vite `root` from the command's working directory. Resolve a relative `aiI18n({ directory })`
   against that root; use an absolute `directory` unchanged. The default directory is `i18n`.
4. Pass the resulting absolute path as `i18n_directory`.

If more than one Vite app is plausible, ask the user which app to use before calling MCP.
The app's framework mode and `autoImport` setting affect source integration but do not change the MCP
directory contract. Do not add or remove Runtime imports as part of a translation-only MCP task.
Dev may inline ordinary static named Runtime imports, while Build keeps its static registration modules;
neither behavior changes the requirement to use a full Build for a complete extracted set.
When package installation, Vite configuration, or Runtime source integration is incomplete or
requested, use the `integrate-ai-i18n` Skill before starting this translation workflow.

The selected app's extracted set includes every reachable local workspace source processed by that
Vite build. Treat source-only packages as `source_files` within the consuming app, not as separate MCP
targets. Never point two Vite builds at one i18n directory; call the tools once per selected app.
Use tool-returned `source_file` values; never decode or guess a source path from a physical filename.

Run the selected app's full Vite Build before first use when extraction is missing or empty, and after
source, branch, or extraction configuration changes that make it stale. Do not execute Vite config
merely to locate the directory. Never open or edit Translation Memory storage directly.

When that app's Vite Dev Server is running, successful MCP Translation Memory or override writes are
observed and applied to its in-memory Runtime through HMR. This convenience does not make the Dev
catalog a complete source set: first use, complete audits, and orphan decisions still require the
full Build above. Do not restart Dev or edit generated locale files merely to expose an MCP write.

When the target explicitly registers `aiI18nReview()`, its Vite Dev console is the preferred interface
for a person interactively choosing a small number of review values. Use the in-page launcher when page
context or element picking matters; use the printed `/__ai-i18n/` URL for all-page review. The URL remains
available when `printUrl: false`, and the launcher may be absent when `launcher: false`. Its in-page picker may resolve a static HTML element directly
to one occurrence; when runtime-rendered copy has multiple candidates, the person must choose the
exact file, line, and column rather than accepting an inferred first match. This Skill remains the
authority when an Agent performs batch work,
automates writes, audits the complete extracted set, or acts on explicit user-approved wording.
The embedded workbench's default current-page scope can be switched to all extracted copy; the standalone
workbench starts with all extracted copy and has no page picker. Multiple picker matches enter a
file and occurrence locate hierarchy instead of selecting the first result. Both paths write the same project `overrides/` shards; do not run MCP review writes concurrently with an open
review-console save operation.

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
be prepared. When `message.comment` and project terminology do not disambiguate short copy, request
`include_occurrences: true`, then read the nearby source lines for the returned files from the target
workspace. Do not request occurrences for every batch by default or treat paths and locations as write
identity for Translation Memory. For a user-approved file-scoped human review, copy exact returned
`source_file` values into the override update's `files`. For an occurrence-scoped review, copy the
exact `source_file`, 1-based `line`, and 0-based `column` into `occurrences`; this is the only scope
that distinguishes repeated calls on one line. Never derive, shorten, or guess these values. When a tool
fails, follow its returned `next_action` before consulting the recovery reference.

## Report

Report the selected app and absolute i18n directory, added, overwritten, cleared or deleted, unchanged,
remaining, and failed counts. Explain unresolved errors in the user's language without exposing
internal message IDs.
