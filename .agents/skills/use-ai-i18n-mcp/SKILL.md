---
name: use-ai-i18n-mcp
description: Use the ai-i18n local MCP tools to locate files with missing translations, page through message details, translate selected locales, and safely write values back to extracted files. Use when a user asks to inspect, count, translate, complete, or verify ai-i18n translation files through ai_i18n_list_translation_files, ai_i18n_list_translations, or ai_i18n_write_translations, especially in monorepos where the final Vite output directory must be derived first.
---

# Use ai-i18n MCP

Use discovery plus the three translation tools in a read → translate → write → verify loop. Never
scan or edit generated JSON manually when the MCP tools are available.

`@ai-i18n/mcp` is an independently versioned Node package, not a Vite subpath. Register the package as
a local stdio server with `npx -y @ai-i18n/mcp@alpha` during prerelease, or call its published `ai-i18n-mcp` executable when
it is already installed. Registration takes no project path. Honor the Node range declared by that
package, and never write non-protocol output to the server's stdout.

## Establish the project path

1. Call `ai_i18n_discover` without arguments. It uses MCP workspace roots and returns absolute
   `i18n_directory` candidates. Registration still takes no project path.
2. If exactly one candidate is returned, use it. If multiple candidates are returned, read the
   target app's `vite.config.*` and match Vite `root` plus `aiI18n({ directory })`; do not execute the
   config. Pass `cwd` only when the client does not expose workspace roots.
3. Pass the selected absolute path unchanged to every translation tool.

Never invent or manually concatenate a path when discovery returns it. One MCP registration can
serve different projects because the target directory is supplied on each translation tool call.

Require an existing `cache.json`. If the protocol files do not exist yet, run or ask the user to run the project's Vite Dev/Build command before continuing.
Running `@ai-i18n/eslint-plugin` only validates static `t()` arguments; it never creates or reconciles these protocol files.
Source messages may also come from object or array members marked with the import-free
`defineI18nMessages()` compiler macro. MCP output and write contracts are unchanged: use the
resulting extracted `source`, `message_id`, and file path exactly as returned.
The optional LangChain Provider's `batchLength` and `maxConcurrency` govern automatic model calls;
they do not change MCP pagination limits, write batch limits, or this manual translation workflow.
Vue and React modes may produce flat extracted files such as `src_components_App.tsx.json`. Tool
results still identify them by the original source path. The framework selected for that Vite build
does not change MCP discovery, pagination, or write semantics.
`loading.strategy: 'locale'` only changes browser language assets. It does not change MCP tools,
protocol paths, locale names, pagination, or the rule that writes only extracted files.
Optional Vite `cache.maxMessages` and `cache.maxBytes` settings also do not change MCP paths or tool
contracts. Cache v2 contains messages only; active references come from extracted files and the
current ProjectState. MCP writes remain in extracted files and are protected while active. On the next Vite
reconciliation, inactive Translation Memory may be pruned to satisfy those limits; do not bypass
that policy by editing `cache.json`.

## Run the workflow

### 1. List files needing translation

Call `ai_i18n_list_translation_files` with:

- `i18n_directory`: the resolved absolute directory.
- `locale`: only when the user requested one target locale.
- `limit`: normally leave the default `50`; use at most `200`.
- `cursor`: omit on the first call, then pass `next_cursor` unchanged.

Continue until `next_cursor` is absent, unless the user explicitly requested only a sample. Use `missing_by_locale` to prioritize work and do not treat files omitted from the result as broken; the tool returns only files with effective `null` values.

### 2. Read translation details

For each selected `file`, call `ai_i18n_list_translations` with the same `i18n_directory`, the exact returned file value, and `missing_only: true`. Keep the default `limit: 100` and follow every `next_cursor`.

The server also applies a response character limit, so a page can contain fewer than the requested number of items while still returning `next_cursor`. Cursor presence, not item count, decides whether pagination is complete.
List tools return the same complete page in JSON text and `structuredContent`; read either form, but
never treat a summary rendered by the client UI as the full response.

Use these fields while translating:

- `source`: source text.
- `comment`: optional author-provided disambiguation; often absent. Use it when present, and do not invent a comment when translating.
- `locations`: source locations when the query is scoped to a file.
- `missing_locales`: locales that may be filled.
- `translations`: existing terminology that must remain consistent.
- `message_id`: opaque stable identifier; copy it exactly.

Prefer file-scoped reads before writes because the write tool accepts one extracted source file. A global read without `file` is suitable for review or deduplicated counts, but shared messages may occur in multiple files.

### 3. Translate and write

Translate only locales present in `missing_locales`. Preserve placeholders, HTML-like tokens, interpolation syntax, product names, whitespace intent, and the meaning supplied by `comment`. `{{0}}`, `{{1}}` are reorderable runtime values; `{{=0}}`, `{{==0}}` are escaped literal tokens. Preserve every token exactly and never exchange the two forms. Never invent or alter `message_id`, `source`, locale names, or file paths.

Group writes by exact `file`. Call `ai_i18n_write_translations` with no more than 100 entries per call. Each `(message_id, locale)` pair must occur once in a request. Write batches sequentially when they touch the same file.

The write operation is intentionally narrow:

- It fills only effective `null` translations.
- Repeating the same value is idempotent and counted as unchanged.
- A different existing non-null value causes an error rather than an overwrite.
- All entries are validated before the extracted file is atomically replaced.

On an overwrite refusal, unknown locale, missing message, or stale file error, re-read that file and rebuild the batch from current results. Do not bypass the guard by editing `cache.json` or `locales/**`.

### 4. Verify completion

Re-run `ai_i18n_list_translations` for every written file and requested locale with `missing_only: true`. Completion means all pages in the requested scope are empty. Report applied, unchanged, remaining, and failed counts rather than claiming the whole project is complete from a partial page.

When Vite Dev or `vite build --watch` is running, it reconciles the write automatically without
reparsing unchanged source. Otherwise tell the user to run the next Vite Dev/Build command so
`cache.json`, duplicate extracted occurrences, and `locales/**` are synchronized. Restart an active
Build Watch process after Vite config, plugin, extractor, or schema changes. Do not manually
synchronize those derived files.

Translation completion does not make previously rendered imperative DOM reactive. For Vanilla
applications, separately confirm that the host subscribes to Runtime updates and re-renders;
the MCP tools only maintain translation protocol data.

After Vite reconciliation, commit source changes, generated `ai-i18n.d.ts`, `cache.json`,
`extracted/**`, and `locales/**` together. MCP writes only extracted; it never makes the other
protocol files optional.

## Handle common failures

- **Directory not found**: recompute Vite root plus `directory`; do not search arbitrary temporary folders.
- **Unknown locale**: use locale values from `aiI18n({ locales })`, not labels.
- **Invalid cursor**: restart that listing from the first page; cursors are opaque and must not be edited.
- **Shared message**: write through a file returned for that message, then let Vite reconcile other occurrences.
- **MCP tools unavailable**: report that `@ai-i18n/mcp` must be registered as a local stdio server; do not silently fall back to broad source-tree editing.
