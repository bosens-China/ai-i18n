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
