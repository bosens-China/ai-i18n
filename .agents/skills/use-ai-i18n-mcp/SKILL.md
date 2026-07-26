---
name: use-ai-i18n-mcp
description: Use the ai-i18n local MCP tools to validate a final translation directory, list missing messages, fill AI Translation Memory, and safely commit human review values to overrides.json. Use for ai_i18n_list_translation_files, ai_i18n_list_translations, and ai_i18n_write_translations, especially in monorepos where the Agent must derive one Vite build's final output directory first.
---

# Use ai-i18n MCP

Use the translation tools in a locate → read → translate → write → verify loop. Do not scan the
workspace for protocol directories or edit generated JSON manually when the MCP tools are available.

`@ai-i18n/mcp` is an independently versioned local stdio package. During prerelease register
`npx -y @ai-i18n/mcp@alpha`; registration takes no project path.

## Establish the project path

1. Identify the exact Vite app requested by the user. Read that app's `package.json`, workspace
   scripts, and `vite.config.*` as text; do not execute the config. In a monorepo, do not use the
   repository root merely because it is the MCP workspace root. If several apps are plausible and
   the task does not identify one, ask the user which build to use.
2. Determine Vite `root`. Resolve an explicit `root` using the command's working directory. When
   `root` is omitted, use the directory in which that app's Vite command runs; workspace package
   scripts normally run in the package directory, while a root script may run from the repository
   root.
3. Read `aiI18n({ directory })`. Resolve it against the final Vite `root`; when omitted, use `i18n`.
   Convert the result to an absolute path. Do not search sibling apps for a directory that happens
   to contain similarly named JSON files.
4. Pass that absolute path as `i18n_directory` to a list tool. The server validates that it exists,
   is a directory, and contains valid `translations.json`, `overrides.json`, and `extracted/`.

Require existing `translations.json`, `overrides.json`, and `extracted/`. Run Vite Dev/Build first
when they do not exist. Running ESLint never creates protocol files.

Framework mode, flat extracted filenames, `defineI18nMessages()`, Provider batching, and
`loading` do not change MCP directory validation, pagination, or write semantics.
`cache.maxMessages` and `cache.maxBytes` still bound inactive history, but now measure
`translations.json`.

## Run the workflow

### 1. List files needing translation

Call `ai_i18n_list_translation_files` with:

- the resolved `i18n_directory`;
- `locale` only when the user requested one;
- default `limit: 50` or at most `200`;
- each returned `next_cursor` unchanged.

Continue until no cursor remains unless the user requested a sample. The tool returns only files
whose effective translations still contain `null`.

### 2. Read translation details

For each selected `file`, call `ai_i18n_list_translations` with the exact returned file,
`missing_only: true`, and the same directory. Follow every cursor; response character limits may
make a page shorter than `limit`.

Use:

- `source` as the source text;
- optional `comment` as author-provided context;
- `locations` when scoped to a file;
- `missing_locales` as the only writable locales;
- existing `translations` for terminology;
- opaque `message_id` copied exactly.

Prefer file-scoped reads because writes require one source file. The file selects and validates
message ownership; it is not the physical write target.

### 3. Translate and write

Preserve product names, whitespace intent, and every template token. `{{0}}`, `{{1}}` are runtime
values; `{{=0}}`, `{{==0}}` are escaped literal tokens. Never exchange or alter them.

Group writes by exact file. Send at most 100 unique `(message_id, locale)` entries per call.
Use the default `mode: "fill"` for translation work.

The write operation:

- obtains the shared cross-process Translation Memory lock;
- re-reads the latest `translations.json` inside the lock;
- validates the full batch;
- fills only values that are still `null`;
- treats the same value as idempotent;
- rejects a different existing non-null value;
- increments `revision` only when content changes;
- atomically replaces `translations.json`.

MCP never writes extracted or locales. Do not bypass its guards by editing those derived files or by
replacing `message_id` with `source`.

On an overwrite refusal or unknown locale, re-list the file and rebuild the batch from current
results. A missing-message error means only that the requested `message_id` does not exist in the
selected source file; re-list that file and use the returned ID without inferring another cause.

### 4. Apply human review

Use `mode: "review"` only when the user explicitly asks to revise an existing translation and
provides or approves the replacement wording. Review writes `overrides.json`, not AI memory.
`review_scope: "default"` is the default and affects every occurrence of the source.
`review_scope: "message"` requires a message created with a non-empty
`t(source, { comment })` and affects only that comment-specific message ID. That override wins over
the source default, which wins over AI memory.

Never infer review intent from a general translation request. Do not use review mode to resolve a
concurrent overwrite refusal automatically; re-list and ask the user when the intended wording is
unclear.

### 5. Verify completion

Re-run `ai_i18n_list_translations` with `missing_only: true` for every written scope and follow all
pages. Report applied, unchanged, remaining, and failed counts.

Running Vite Dev/Build Watch observes `translations.json` and `overrides.json` and rebuilds locales
without reparsing unchanged source. Otherwise ask the user to run the next Dev/Build command. After
reconciliation, commit source changes, generated `ai-i18n.d.ts`, both translation files,
`extracted/*.json`, and `locales/**` together.

## Handle common failures

- **Directory not found**: recompute Vite root plus `directory`.
- **Protocol directory incomplete**: run the target app's Vite Dev/Build, then retry the same final
  directory; do not scan for another directory.
- **Unknown locale**: use locale values from `aiI18n({ locales })`, not labels.
- **Invalid cursor**: restart that listing; cursors are opaque.
- **Shared source**: fill updates that message ID's AI memory. Review default affects every occurrence
  of the source; review message affects only one comment-specific message.
- **MCP tools unavailable**: report that `@ai-i18n/mcp` must be registered locally; do not silently
  fall back to broad source-tree editing.
