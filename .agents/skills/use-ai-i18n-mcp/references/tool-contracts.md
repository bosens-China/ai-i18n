# Tool contracts

## Shared identity and pagination

Start with `ai_i18n_list_translations` and pass only `i18n_directory`. Its default `view: "missing"`
discovers source files and returns writable missing entries.

- Follow `next_cursor` until `has_more` is false unless the user asked for a sample.
- Lists request 100 records by default and accept `limit` up to 500. A size-limited page may contain
  fewer records; continue with `next_cursor`.
- Use `view: "summary"` for progress counts and `view: "all"` only when existing values are required.
- Use `message.source` as translation input and `message.comment` as author context.
- Use `missing_locales` as the default target locale set.
- Copy the complete `message` object into write tools. Internal message IDs are not public inputs.
- Treat `source_files` as the complete shared occurrence range. It can filter list operations but is
  not part of write identity.

One message update affects every listed source file.

## Automatic translations

Use `ai_i18n_set_translations` for ordinary translation work. Each update contains
`message: { source, comment? }`, `locale`, and `value`.

- Each batch accepts at most 500 inputs.
- Leave `overwrite_existing` unset or false unless the user explicitly requests replacement.
- Identical repeated targets and values are applied once and reported through `deduplicated_count`.
- Different values for one message and locale fail the whole batch.
- Empty strings are valid translations.

Use `ai_i18n_clear_translations` only when the user asks to reset specific automatic translations.
It sets the selected fields to `null` without removing messages, locales, or human reviews.

## Human review

Human decisions belong in `overrides.json`, not `translations.json`.

Use `ai_i18n_list_overrides` to inspect current values, including orphaned values. Use
`ai_i18n_set_overrides` only when the user explicitly requests or approves human review wording:

- `scope: "default"` affects every occurrence of the same source text.
- `scope: "message"` affects one listed message and requires a non-empty static comment.
- Setting an override is an upsert and may replace an existing human value.

To remove a human value, list it first and pass the returned opaque `override_id` to
`ai_i18n_delete_overrides`. Never construct an override ID.

## Write and verification boundaries

- Translation tools modify only `translations.json`.
- Human review tools modify only `overrides.json`.
- MCP does not modify `extracted/` or `locales/`.
- Preserve every template token before writing.
- After automatic translation changes, repeat `ai_i18n_list_translations` with the same scope.
- After human review changes, repeat `ai_i18n_list_overrides` with the same scope.
