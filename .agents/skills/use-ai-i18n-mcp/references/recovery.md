# Error recovery

## Empty or stale extraction

If the first translation list returns no source files, run the entry scan described in the Skill for the same target app and
retry once. If the scan succeeds and the retry remains empty, report that the selected entries have no extracted messages. Do not scan
sibling apps.

## MCP errors

First follow the returned `next_action`. Use this table only when more context is needed or an older
server does not return that field.

| Error | Recovery |
| --- | --- |
| `DUPLICATE_JSON_KEY` | Follow the conflicting JSON key procedure below; do not scan or Build to overwrite it. |
| `I18N_DIRECTORY_NOT_FOUND` or `I18N_DIRECTORY_NOT_ABSOLUTE` | Recompute Vite root plus `aiI18n.directory`, then use an absolute path. |
| `REQUIRED_PROTOCOL_FILE_MISSING` or `REQUIRED_PROTOCOL_DIRECTORY_MISSING` | Run the Skill entry scan for the same app and retry once. |
| `INVALID_PROTOCOL_JSON`, `INVALID_PROTOCOL_FILE`, or `PROTOCOL_PATH_NOT_DIRECTORY` | Restore or repair the reported protocol path, refresh with the Skill entry scan or a full Build, then retry. |
| `DUPLICATE_EXTRACTED_SOURCE` | Run the Skill entry scan so Vite migrates legacy filenames, then retry. If it persists, report `conflicting_files`; MCP must not delete them. |
| `MESSAGE_ID_SOURCE_CONFLICT`, `MESSAGE_MISSING_FROM_TRANSLATIONS`, or `MESSAGE_METADATA_MISMATCH` | Refresh with the Skill entry scan or a full Build using a clean extracted directory, then list again. Report the returned details if the error persists. |
| `SOURCE_FILE_NOT_FOUND` | List with `view: "summary"` and without the filter, then copy an exact returned `source_file`. |
| `MESSAGE_NOT_FOUND` | Inspect returned `suggestions`; copy a complete candidate only if its source and comment match the intended message. Otherwise list again and copy the exact returned `message` object. |
| `MESSAGE_NOT_FOUND_IN_SOURCE_FILE` | List again with `include_source_files: true`, then keep only exact files that contain the selected message. |
| `MESSAGE_NOT_FOUND_AT_SOURCE_LOCATION` | List again with `include_occurrences: true`; copy a current exact location and obtain approval rather than guessing a moved call. |
| `INVALID_OVERRIDE_SCOPE` | Retry with exactly one scope: global, `files`, or `occurrences`; never send `files` and `occurrences` together. |
| `INVALID_BATCH_LOCALE` | Either provide `default_locale` once and omit every item locale, or omit it and provide locale in every item. |
| `INVALID_TRANSLATION_FILTER` | Use text filters only with the `missing` or `all` translation view. |
| `DUPLICATE_TARGET_CONFLICT` | Choose one value for the repeated message and locale, then retry the batch. |
| `TRANSLATION_CONFLICT` | Re-list current values. Set `overwrite_existing: true` only with explicit user approval. |
| `TEMPLATE_TOKEN_MISMATCH` | Compare `expected_tokens` and `received_tokens`; add every entry from `missing_tokens`, remove every entry from `unexpected_tokens`, then retry. Repeated tokens are significant. |
| `UNKNOWN_LOCALE` | Use locale values from `aiI18n({ locales })`, not display labels. |
| `INVALID_CURSOR` | Restart the corresponding list without the cursor. |
| `INVALID_OVERRIDE_ID` | List overrides again and copy the returned ID exactly. |
| `INVALID_ORPHAN_ID` | Run a full Build, list orphan messages again, and copy the returned ID exactly. |
| `ORPHAN_MESSAGE_REACTIVATED` | Do not retry deletion from the stale list. Run a full Build, re-list, show the changed result, and request approval again. |
| `ORPHAN_ID_CONFLICT` | Stop cleanup and report the returned error details; do not retry deletion. |
| `DUPLICATE_TARGET` | Remove repeated targets and retry. |

SQLite cache failures belong to the Vite process, not MCP recovery. MCP always uses project JSON; do
not install `@ai-i18n/sqlite` or `better-sqlite3` merely to make an MCP operation work.

## Conflicting JSON keys

`DUPLICATE_JSON_KEY` identifies `file`, `json_pointer`, and the `first` and `duplicate` key positions.
Both position fields use 1-based lines and columns. Read the raw text at those locations and show the
conflicting values; `JSON.parse` alone discards earlier values and cannot establish the intended one.
Use an already explicit user decision or ask which value to retain. Only then make a minimal repair
to that file and retry the original list or write. This approved repair is the exception to the normal
ban on direct protocol-file edits. Preserve unrelated entries and coordinate with active writers.
Do not choose by order, rewrite a parsed copy, delete journals, or run scan/Build to bypass the conflict.

## Vite HMR reports a missing transaction journal

If an MCP write succeeds but Vite reports `ENOENT` for `.transaction.json`, verify the write with
the matching read-only MCP list first. Do not repeat a successful mutation, recreate or delete the
journal, or infer translation corruption from that watcher error. Use the `integrate-ai-i18n` Skill
for the target app's installed-version check and Dev recovery, then verify the page receives updates
from real translation or override shard changes. A journal event alone is not an HMR acknowledgement;
do not touch it to force refresh or recovery.

## A successful write is not reflected in Dev

Verify the write using the matching read-only MCP list before retrying it. For a human override,
verify the selected locale and exact file or occurrence scope. Automatic translation `null` and a
Review confirmation badge are not sufficient evidence of the final displayed value.
If the stored value is correct, use `integrate-ai-i18n` for Dev resource and active-page verification;
do not rewrite successful values, touch generated files, or infer a complete catalog from Dev counts.

## Tool unavailable

For ordinary list/set translation, use the Skill-only helper described in the scanning reference
linked by `SKILL.md`. Review, clear, and orphan operations still require Host MCP. If the installed
package lacks the internal helper, report the version mismatch and update within the task scope;
do not replace the workflow with source-tree editing or direct protocol-file writes.
