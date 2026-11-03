# Remote translation integration

Use only when requested or already configured. Read the installed types and the public
“远程文案与译文” and “RemoteAdapter” pages selected from llms.txt before editing.

## Configuration decisions

- Keep the existing local workflow unless remote acquisition is requested. Publish-only can coexist
  with Provider; load and Provider are mutually exclusive. Never remove Provider silently to resolve
  a conflict: follow the user's chosen source, or ask when that choice is unclear.
- Use the existing @ai-i18n/vite package. /remote is a subpath, not a separate dependency.
- Preserve the user's organization: inline remote is valid; defineRemote in a separate Node-only file
  is optional. Do not create an automatic config-discovery layer. Put requests inside callbacks,
  not in module initialization. Pass base URL and credentials through the project's existing setup.
- Inspect upload/download key mapping together. Keep source + comment distinguishable even when
  the service does not accept a comment field. Do not guess a business key or silently merge collisions.
- Convert service responses into the installed complete-snapshot contract. Filter a global server
  dictionary to the current context; do not pass unrelated messages or target locales through.
- Parse network data at the adapter boundary. Forward context.signal to requests. Do not implement
  unbounded polling for an asynchronous translation task or treat its receipt as a translation result.
- Select only public JSON fields for publicMeta. Register its type through /runtime's Register and
  include that declaration in both the Node and browser TS projects. Do not import the Node adapter
  into browser code or edit generated declarations. Do not use a call-site cast to hide a mismatch.

- Default mode is replace: local human overrides precede remote automatic values, and local automatic
  Translation Memory/SQLite are isolated. Use explicit mode: 'overlay' only for requested partial
  server priority: remote non-null values > local human overrides > local automatic values > source.
  Omission/null withdraws coverage and restores current local results; empty strings remain valid.
  Each successful response replaces the entire remote layer. Keep that layer out of local persistence.

## Validation and recovery

- Verify one real remote Build when endpoint access is authorized and credentials are available;
  otherwise run a fixture/mock integration and explicitly report that limitation.
- Exercise static and lazy source, configured locale splitting, missing targets, and local overrides.
  In replace mode, confirm acquisition does not rewrite translations/ or open SQLite. In overlay
  mode, confirm normal local persistence/cache use continues without remote-value contamination;
  exercise withdrawal, local Dev edits, comment/locale isolation and the final merged missing gate.
- Verify the first cold browser visit with a fast backend: the applied metadata and effective copy
  must update without a manual reload. A server receipt or successful load count alone is insufficient.
- Keep an existing failOnMissingTranslations gate enabled. Remote gaps must be repaired through the
  service or explicitly approved local overrides in replace mode. In overlay mode, local automatic
  filling can supply uncovered items when authorized, but cannot replace server-priority values.
- A failed publish warns; a failed load fails Build. Do not silently introduce cached fallback.
  Dev retains its last successfully applied snapshot on failure; fix the adapter and restart to retry.
- Entry scanning skips remote callbacks and is not remote-coverage evidence. MCP automatic lists
  describe local files. Follow use-ai-i18n-mcp's remote boundary for any Agent writes.
- Check getTranslationMeta() for the version actually applied and handle undefined. Service-only
  changes require another Dev acquisition or Build; do not promise automatic online updates.
