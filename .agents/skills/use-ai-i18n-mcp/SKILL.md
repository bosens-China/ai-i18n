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

The directory must contain `translations.json`, `overrides.json`, and `extracted/`. Run the target
app's full Vite Build before the first MCP use when `extracted/` is missing or empty. Build again
after switching branches or changing source or extraction configuration when the local result may be
stale. Prefer Build over Dev because Dev covers only browser-requested modules.

## List missing translations

Start with `ai_i18n_list_translations` and pass only `i18n_directory`. Its default `view: "missing"`
discovers source files and returns writable missing entries.

- Follow `next_cursor` until `has_more` is false, unless the user asked for a sample.
- Use `source` as the translation input and `comment` as author context.
- Use `missing_locales` as the default set of target locales.
- Copy `source_file` and opaque `message_id` exactly. Never substitute `source` for `message_id`.
- Use `view: "summary"` for progress counts and `view: "all"` only when the task requires existing
  values.

If the first list returns no source files, run one full Build for the same app and retry once. If the
retry remains empty, report that the target build has no extracted messages; do not scan sibling apps.

## Update automatic translations

Use `ai_i18n_set_translations` for ordinary translation work. A batch may contain at most 100 unique
updates. Each update needs `source_file`, `message_id`, `locale`, and `value`.

- Leave `overwrite_existing` unset or false unless the user explicitly asks to replace an existing
  automatic translation.
- Preserve product names, intentional whitespace, and every template token. Empty strings are valid
  translations.
- Use `ai_i18n_clear_translations` only when the user asks to reset specific automatic translations.
  It sets the selected fields to `null` and does not remove messages or human reviews.

## Manage human review

Human decisions belong in `overrides.json`, not `translations.json`.

Use `ai_i18n_set_overrides` only when the user explicitly requests or approves human review wording:

- `scope: "default"` affects every occurrence of the same source text.
- `scope: "message"` affects one listed message and requires a non-empty static comment.
- Setting an override is an upsert and may replace an existing human value.

To remove a human value, first call `ai_i18n_list_overrides`, then pass the returned opaque
`override_id` to `ai_i18n_delete_overrides`. Do not construct override IDs.

## Verify and recover

After automatic translation updates, repeat `ai_i18n_list_translations` with the same source and
locale scope. After human-review changes, repeat `ai_i18n_list_overrides`. Report added, overwritten,
cleared or deleted, unchanged, remaining, and failed counts.

| Error | Recovery |
| --- | --- |
| `I18N_DIRECTORY_NOT_FOUND` or `I18N_DIRECTORY_NOT_ABSOLUTE` | Recompute Vite root plus `aiI18n.directory`, then use an absolute path. |
| `REQUIRED_PROTOCOL_FILE_MISSING` or `REQUIRED_PROTOCOL_DIRECTORY_MISSING` | Run one full Build for the same app and retry once. |
| `SOURCE_FILE_NOT_FOUND` or `MESSAGE_NOT_FOUND` | List again and copy the exact returned path and ID. |
| `TRANSLATION_CONFLICT` | Re-list current values. Set `overwrite_existing: true` only with explicit user approval. |
| `TEMPLATE_TOKEN_MISMATCH` | Preserve every template token before retrying. |
| `MESSAGE_SCOPE_REQUIRES_COMMENT` | Use message scope only for a listed message with a static comment. |
| `UNKNOWN_LOCALE` | Use locale values from `aiI18n({ locales })`, not display labels. |
| `INVALID_CURSOR` or `INVALID_OVERRIDE_ID` | Restart the corresponding list and copy the returned value exactly. |

If MCP tools are unavailable, explain that `@ai-i18n/mcp` must be registered locally. Do not silently
replace this workflow with broad source-tree editing.
