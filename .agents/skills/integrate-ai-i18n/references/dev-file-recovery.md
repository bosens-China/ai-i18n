# Dev file recovery

When a Vite stack reports `ENOENT` while `@ai-i18n/vite` calls the hot-update reader for
`translations/.transaction.json` or `overrides/.transaction.json`:

1. Inspect the target app's resolved plugin version and stack. Do not infer the release or number
   of MCP processes from another agent's explanation.
2. Treat the missing journal as a possible completed-transaction read race, not proof of corrupt
   translations. Current Dev and Build Watch ignore internal journals and atomic JSON temporary
   files within the selected i18n directory. Dev filters them before queueing or flushing persistence;
   ordinary storage reads and transactions retain responsibility for journal recovery. Real managed
   file create/update reads must tolerate `ENOENT` and reconcile current disk state; other read
   errors must remain visible.
3. Never create, delete, or edit the journal as a repair, and never ignore the whole translation
   directory in the watcher. Preserve committed shards and ongoing writes.
4. For an affected release, restarting Dev is a temporary recovery. Verify that a candidate release
   includes the fix before recommending an upgrade; do not invent a fixed version.
5. After recovery, verify a translation update reaches the active page through HMR. Investigate
   separate JSON validation or permission errors independently.

## Duplicate JSON keys

Follow the public generated-files page for duplicate-key behavior. Identical values remain readable
and are cleaned by the next normal write of the relevant file; do not run an extra Build for cleanup.
Conflicting values stop the operation and report the file and both key locations. Do not disable
validation, choose the last value, or regenerate over the conflict. Use `use-ai-i18n-mcp` and its error
recovery procedure for an approved minimal repair, then retry the affected operation and verify Dev.

## Stale translations or incomplete counts

- After an authorized review or translation write, verify the active page and a fresh page request in
  the same target locale and scope. Saving, replacing, and removing review values must also survive
  page reloads, with or without locale loading. A successful write or HMR event alone does not prove
  that the next served resource contains the current value.
- If only a refreshed page is stale, inspect the installed plugin version and returned business or
  locale resource before changing application subscriptions. Do not edit generated locale files or
  repeat a successful write to force cache invalidation.
- Treat Dev missing counts as the discovered module set, deduplicated by message and target locale.
  Review may additionally show a persisted scan or Build extraction. For a complete translation
  audit, use the selected app's entry scan through `use-ai-i18n-mcp`; retain a full Build for
  production validation or orphan cleanup. Do not enable a Provider just to populate the UI.
- Do not infer final missing translations from an automatic `null` or Review's confirmation badge.
  Check effective overrides for the actual file and occurrence; one confirmed scope does not prove
  every occurrence is translated. Follow the public translation-review page for user-facing states.
