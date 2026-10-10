# Tool contracts

## Shared identity and pagination

Start with `ai_i18n_list_translations` and pass only `i18n_directory`. Its default `view: "missing"`
discovers source files and returns writable missing entries.

- Follow `next_cursor` until `has_more` is false unless the user asked for a sample.
- Lists request 100 records by default and accept `limit` up to 500. A size-limited page may contain
  fewer records; continue with `next_cursor`.
- Use `view: "summary"` for progress counts and `view: "all"` only when existing values are required.
- For a targeted `missing` or `all` query, use `source_contains` or `translation_contains`. Both are
  case-insensitive substring filters applied before pagination. `translation_contains` checks only
  non-null values in the selected `locales`. Do not combine either filter with `summary`. Page
  `total_count` reflects matches; the progress counters continue to describe the selected files and locales.
- Use `message.source` as translation input and `message.comment` as author context.
- Use `missing_locales` as the default target locale set.
- Copy the complete `message` object into write tools. Internal message IDs are not public inputs.
- List items omit `source_files` by default. Set `include_source_files: true` only when the task needs
  the complete shared occurrence range or per-file impact reporting. The `source_files` input can
  still filter list operations and is not part of write identity.
- Set `include_occurrences: true` only when a message needs source context. Each returned occurrence
  pairs one `source_file` with all extracted line and column locations for that shared message. Read
  nearby source from the target workspace; MCP does not return source snippets. Occurrences are not
  part of write identity.

One message update affects every source file where that message occurs.

Batch schemas merge the same unknown top-level item key into one validation error with its occurrence
count, first index, valid keys, and a retry action. Remove the invalid key from every item before
retrying; do not fix only the first reported index.

Physical files under `extracted/` use the normalized source's SHA-256 as their filename. Project
`translations/` and `overrides/` instead use locale hash buckets whose internal keys are storage
details. The JSON `source` field and MCP results are authoritative; never derive `source_files`,
message identity, or write targets from any physical filename or bucket key.

## Automatic translations

Use `ai_i18n_set_translations` for ordinary translation work. Each update contains
`message: { source, comment? }` and `value`. For a single-locale batch, set `default_locale` once and
omit every item `locale`. Otherwise omit `default_locale` and provide `locale` in every item. Never
mix the two forms in one call. Apply the same locale rule to clear targets and override updates.

- Each batch accepts at most 500 inputs.
- Leave `overwrite_existing` unset or false unless the user explicitly requests replacement.
- Identical repeated targets and values are applied once and reported through `deduplicated_count`.
- Different values for one message and locale fail the whole batch.
- Empty strings are valid translations.

Use `ai_i18n_clear_translations` only when the user asks to reset specific automatic translations.
It sets the selected fields to `null` without removing messages, locales, or human reviews.

## Optional SQLite suggestions

Call `ai_i18n_list_cache_candidates` only when the user wants candidate wording or local cache
evidence. Pass the exact public `message`, one configured `locale`, and the selected absolute
`i18n_directory`. If the app uses a custom SQLite directory, pass its absolute path as
`data_directory`; otherwise omit it. If `i18n_directory` is outside the Vite app, pass that app's
absolute directory as `app_directory` so the server resolves its installed `@ai-i18n/sqlite`.
Otherwise omit `app_directory`.

This is read-only. The response contains current_automatic_value, candidates with value/sources/
sources_has_more, has_more, next_offset, and automatic_value computed from ALL eligible values.
Sources include project, kind (automatic/reviewed), and optional file/location. Follow next_offset
using offset. To read more sources for one value, pass that exact value and increase source_offset
by the number already returned. Each candidate/source page is bounded to ten. Never infer uniqueness
from a partial page, rank by recency/votes, or treat source scope as the destination scope.
Reviewed-only values cannot auto-fill; any conflicting reviewed value blocks unique automatic reuse.
Source project existence is not checked. Use the normal authorized set/override tools to adopt a value.
The human review workbench offers the same suggestions, filling a draft before explicit save.

## Personal cache management

Use ai_i18n_list_cache_projects only for requested cache inspection/cleanup. Pass the same directory
parameters; offset pages contain at most 50 project/records/orphans/synced_at items and has_more.
Use exact returned project paths, including paths that no longer exist.

ai_i18n_clean_cache accepts scope orphans/project/all and project_directory for the first two only.
First omit preview_token to preview records and token without deletion. Execute only within explicit
user authorization for that scope by returning token in preview_token. A changed cache requires a
new preview. This deletes only SQLite contributions; project JSON stays intact and a future sync
can contribute current values again. Never clean the cache during ordinary translation verification.

## Orphan Translation Memory

Use orphan tools only when the user explicitly requests an orphan audit or cleanup. They are not part
of ordinary translation, human review, or completion verification.

1. Set `cleanup.orphanMessages: false` for the audit and run one full Vite Build for the selected app. The default Build deletes orphans before MCP can list them. Browser-driven Dev extraction is incomplete, and
   the Skill scan uses the Dev graph rather than Build-only conditions; neither replaces this
   production graph check before deletion.
2. Call `ai_i18n_list_orphan_messages`, follow every page in the requested scope, and show the user the
   messages and retained translations.
3. After the user explicitly approves deletion, copy the returned opaque `orphan_id` values into
   `ai_i18n_delete_orphan_messages`. Never construct an orphan ID.
4. Repeat the list to verify the remaining orphan set.
5. Restore the original cleanup setting after the audit.

The delete tool removes complete messages from the configured Translation Memory, not individual locale values. It
revalidates the whole batch against the current extracted set before writing; if any target is active,
the whole batch fails. Rebuild, re-list, show the changed result, and obtain approval again. Do not run
Build or edit protocol files concurrently with cleanup.

Orphan translation deletion never removes `overrides/` values. Inspect and delete orphaned human
review values separately through the override tools and only with explicit approval.

## Human review

Human decisions belong in project `overrides/` shards, not automatic Translation Memory.

For interactive human editing during Vite Dev, prefer the local review console when the target Vite
config explicitly registers `aiI18nReview()`. Use these MCP
contracts when an Agent lists, batches, or writes approved decisions. The console and MCP share the
same rule identity, validation, and `overrides/` destination; serialize their writes rather than
editing through both interfaces at once.

Use `ai_i18n_list_overrides` to inspect current values, including orphaned values. Use
`ai_i18n_set_overrides` only when the user explicitly requests or approves human review wording:

- Omit `files` for a global review across the current Vite app.
- Provide one or more exact `source_file` values in `files` for a file-scoped review. Every selected
  file must currently contain the listed message.
- Provide one or more exact `{ source_file, line, column }` values in `occurrences` for an
  occurrence-scoped review. Copy them from `list_translations` with `include_occurrences: true`;
  `line` is 1-based, `column` is 0-based, and every location must currently contain the message.
- `files` and `occurrences` are mutually exclusive. Do not fall back to a nearby location when an
  occurrence is stale; list again and ask for approval of the new exact target.
- `comment` is part of the copied public `message` object and can be combined with either global or
  file scope. Do not add or remove it to simulate file scope.
- File paths are normalized POSIX paths relative to the Vite root. Copy them exactly from list
  results; never use absolute paths, substrings, or globs.
- Setting an override is an upsert and may replace an existing human value.

Resolution priority is occurrence + comment, occurrence default, file + comment, file default,
global + comment, global default, automatic Translation Memory, then source fallback. Scoped list
items always include their identity `files` or `occurrences`; `source_files` remains optional
occurrence evidence and is returned only when requested.

To remove a human value, list it first and pass the returned opaque `override_id` to
`ai_i18n_delete_overrides`. Never construct an override ID.

## Write and verification boundaries

- Translation tools always modify committed project `translations/` buckets through the project
  store. Never calculate bucket keys or edit bucket JSON directly. Writes then parse the selected app
  config and synchronize its enabled personal cache without Dev, extraction or Provider calls.
  Pass absolute app_directory for external i18n directories; otherwise the server locates vite.config.*
  in parent directories. No config means the next Dev/Build sync handles it. Cache failure is a stderr
  warning after committed project writes. Never create a storage marker.
- Project-store writes keep Translation Memory protocol fields in their fixed schema order and sort
  dynamic entry hashes deterministically. Treat resulting hash-position changes as storage formatting;
  do not reorder or rewrite bucket JSON manually.
- A missing local SQLite database gives the optional suggestion tool no candidates. Ordinary MCP
  translation results still come from project JSON.
- Human review tools write project `overrides/` buckets through the store, then synchronize reviewed-only candidates.
- Identical duplicate JSON keys are cleaned during the next normal transaction, even with no business
  changes. Cleanup is not a changed-translation count. Lists do not write merely to deduplicate;
  preexisting journal recovery is unchanged. Conflicting values return `DUPLICATE_JSON_KEY`;
  use the error recovery reference linked from `SKILL.md` for the approved repair boundary.
- MCP does not modify `extracted/` or `locales/`.
- `MESSAGE_NOT_FOUND` may include up to five exact public message candidates. Treat them as read-only
  navigation help; choose and copy a complete candidate only when it matches the intended source and
  comment. Never let similarity authorize a write.
- Preserve every template token before writing.
- On `TEMPLATE_TOKEN_MISMATCH`, compare `expected_tokens` with `received_tokens`, insert every entry
  from `missing_tokens`, remove every entry from `unexpected_tokens`, and retry the corrected whole
  batch. Repeated tokens are significant.
- After automatic translation changes, repeat `ai_i18n_list_translations` with the same scope.
- After orphan deletion, repeat `ai_i18n_list_orphan_messages` after the same complete Build.
- After human review changes, repeat `ai_i18n_list_overrides` with the same scope.
