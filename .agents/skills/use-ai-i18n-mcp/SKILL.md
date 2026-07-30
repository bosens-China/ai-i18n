---
name: use-ai-i18n-mcp
description: Use the six ai-i18n local MCP tools to inspect translations, set or clear translations.json values, and list, upsert, or delete human overrides.json values. Use for ai_i18n_list_translations, ai_i18n_set_translations, ai_i18n_clear_translations, ai_i18n_list_overrides, ai_i18n_set_overrides, and ai_i18n_delete_overrides, especially in monorepos where one Vite build's final i18n directory must be derived first.
---

# Use ai-i18n MCP

Use the tools in a locate → list → update → verify loop. Do not scan the workspace for protocol
directories or edit generated JSON manually while the MCP tools are available.

`@ai-i18n/mcp` is an independently versioned local stdio package. During prerelease register
`npx -y @ai-i18n/mcp@alpha`; registration takes no project path.

## Establish the project path

1. Identify the exact Vite app requested by the user. Read that app's `package.json`, workspace
   scripts, and `vite.config.*` as text; do not execute the config. In a monorepo, do not use the
   repository root merely because it is the MCP workspace root. If several apps are plausible and
   the task does not identify one, ask which build to use.
2. Determine Vite `root`. Resolve an explicit `root` using the command's working directory. When
   omitted, use the directory in which that app's Vite command runs.
3. Read `aiI18n({ directory })`. Resolve it against the final Vite root; when omitted, use `i18n`.
   Convert the result to an absolute path. Do not search sibling apps for a similarly named folder.
4. Pass that absolute path as `i18n_directory`. The server requires valid `translations.json`,
   `overrides.json`, and `extracted/`.

`translations.json` and `overrides.json` are committed; `extracted/` and `locales/` are ignored local
Build outputs. Run the target app's full Vite Build before first MCP use when `extracted/` is missing
or empty. Also Build after switching branches or changing source, Vite/plugin configuration, or
extraction rules when the local output may be stale. Prefer Build over Dev because Dev only sees
browser-requested modules. Running ESLint does not create protocol files.

## Understand tool results

Each call returns exactly one compact JSON `TextContent`. Parse that JSON. There is no duplicate
`structuredContent`. Tool metadata, fields, and error codes are English; explain them in the user's
language.

List results are cursor-paginated and may be shortened at the response character limit. Copy each
`next_cursor` unchanged and continue until `has_more` is false unless the user requested a sample.

## Translate

### 1. Discover and read

Start with `ai_i18n_list_translations` using only the resolved `i18n_directory`. Its default
`view: "missing"` both discovers source files and returns the missing messages, avoiding a separate
path-discovery call.

If the first list returns no source files, run one full Build for the same target app and retry once.
Do not loop builds or scan sibling apps when the retried result remains empty; the target build may
legitimately contain no statically extracted messages.

Optional parameters:

- `source_files`: one or more exact paths copied from previous results;
- `locales`: one or more target locale values;
- `view: "summary"`: per-file progress counts;
- `view: "all"`: every message in the selected extracted files, with raw `translations.json`
  values; it does not expose inactive Translation Memory entries that no extracted file references;
- `cursor` and `limit` for pagination.

Use `source` as the text to translate, `comment` as author context, existing `translations` for
terminology, and `missing_locales` as the default write targets. Copy `source_file` and opaque
`message_id` exactly. Never substitute `source` for `message_id`.

Vue source may use either `t()` or the Vue-only `tRef()` syntax. Both produce the same extracted
message IDs from the same static source/options; the MCP protocol and all six tool schemas do not
distinguish which Runtime API produced an entry.

The optional ESLint rule `ai-i18n/no-redundant-auto-import` only removes redundant Runtime import
syntax in projects that already enabled Vite auto imports. Its diagnostics and autofix do not
change extraction semantics, message IDs, protocol files, or any MCP tool contract.

A whole static message-only object or array passed to `t(messages)` or Vue `tRef(messages)` produces
one extracted entry per unique string leaf, attributed to the containing source file. Primitive
non-string leaves do not produce entries. This extraction feature does not change MCP schemas. If
these entries are absent after adding or changing a tree, run one full Build for the target app and
retry the list once.

The list intentionally reports raw `translations.json` state. A human override does not hide a
still-null AI Translation Memory field.

### 2. Set translations

Call `ai_i18n_set_translations` with at most 100 unique updates. Each update contains
`source_file`, `message_id`, `locale`, and `value`; one batch may span source files.

Keep `overwrite_existing` omitted or false for ordinary translation work:

- null fields are filled;
- identical values are unchanged;
- a different non-null value rejects the whole batch.

Set `overwrite_existing: true` only when the task explicitly calls for replacing existing AI
Translation Memory values and the intended wording is clear. The whole batch remains atomic.

Preserve product names, whitespace intent, and every template token. `{{0}}`, `{{1}}` are runtime
values; `{{=0}}`, `{{==0}}` are escaped literal tokens. Empty string is a valid translation.

### 3. Clear translations

Use `ai_i18n_clear_translations` only when the user asks to remove or reset specific AI Translation
Memory values. Pass up to 100 exact `source_file + message_id + locale` targets. The tool sets those
fields to `null`; it does not delete messages, locales, extracted files, or human overrides.

## Manage human review

Human decisions belong only in `overrides.json`.

### 1. List overrides

Call `ai_i18n_list_overrides`. Omit `source_files` when auditing all overrides so orphaned values are
included. Optional `source_files`, `locales`, `cursor`, and `limit` narrow the result.

Each item is one locale-specific human value. It includes its scope, source, optional
message/comment, related source files, orphan status, and an opaque `override_id`.

### 2. Set overrides

Call `ai_i18n_set_overrides` only when the user explicitly requests or approves human review
wording. Each update contains `source_file`, `message_id`, `locale`, `value`, and `scope`.

- `scope: "default"` affects every occurrence of the same source.
- `scope: "message"` affects only one message ID and requires a non-empty static comment.
- Set is an upsert: it adds a missing value and overwrites an existing target.

Do not use overrides to bypass a translation conflict or infer human intent from a normal
translation request.

### 3. Delete overrides

First list overrides, then copy exact `override_id` values into `ai_i18n_delete_overrides`. Never
construct or edit opaque IDs. Deletion removes only those locale-specific fields and cleans empty
containers. This is also how orphaned human values are removed.

## Verify

After translation updates, re-run `ai_i18n_list_translations` with `view: "missing"` and the
same source/locale scope. After human review changes, re-run `ai_i18n_list_overrides`. Follow every
page and report added, overwritten, cleared/deleted, unchanged, remaining, and failed counts.

All writes acquire a cross-process lock, re-read the latest target file inside the lock, validate
the full batch, update fields, and atomically replace the file. MCP never writes extracted or
locales. Running Vite Dev observes changes and rebuilds locales; otherwise the next Vite Dev/Build
reconciles them.

## Handle common failures

- `I18N_DIRECTORY_NOT_FOUND`: recompute Vite root plus `aiI18n.directory`.
- `I18N_DIRECTORY_NOT_ABSOLUTE`: resolve the directory to an absolute path before retrying.
- `REQUIRED_PROTOCOL_FILE_MISSING` or `REQUIRED_PROTOCOL_DIRECTORY_MISSING`: run the target app's
  full Vite Build, then retry the same directory once; do not scan for another.
- `SOURCE_FILE_NOT_FOUND`: restart the relevant list call without `source_files`, then copy an exact
  returned path.
- `MESSAGE_NOT_FOUND`: re-list the exact source file and copy the returned `message_id`.
- `TRANSLATION_CONFLICT`: re-list current values. Retry with `overwrite_existing: true` only when
  replacement was explicitly intended.
- `TEMPLATE_TOKEN_MISMATCH`: preserve every runtime and escaped literal template token before
  retrying.
- `MESSAGE_SCOPE_REQUIRES_COMMENT`: use `scope: "message"` only for a listed message with a
  non-empty static comment; otherwise use `scope: "default"` when the user intends a source-wide
  override.
- `DUPLICATE_TARGET`: deduplicate the batch by its exact write target and retry.
- `UNKNOWN_LOCALE`: use values from `aiI18n({ locales })`, not labels.
- `INVALID_CURSOR`: restart that listing without a cursor.
- `INVALID_OVERRIDE_ID`: re-list overrides and copy the returned ID exactly.
- MCP tools unavailable: report that `@ai-i18n/mcp` must be registered locally; do not silently
  replace the workflow with broad source-tree editing.

For installation failures involving `fs-native-extensions`, Alpine/musl, or `ADDON_NOT_FOUND`, refer
to `https://bosens-china.github.io/ai-i18n/guide/faq/common.md`.
