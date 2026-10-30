# Remote-source write boundaries

Read the selected application's remote configuration as text, including its explicitly imported
adapter. Do not execute config or callbacks just to identify the source.

- Publish-only preserves the local automatic Translation Memory workflow; use the normal list/set
  rules and authorization. Scanning must not call publish.
- When remote.load uses replace (the default), server snapshots are the automatic source. Host MCP automatic
  tools still read/write local translations/, not that server or the active remote snapshot.
  Never report local missing counts as remote coverage or attempt local automatic filling to repair
  a remote Build gate. Do not disable remote mode or the missing gate to make validation pass.
- For replace-mode remote automatic gaps, explain the configured service/adapter boundary and route integration
  changes to integrate-ai-i18n. Changing server data requires an authorized service workflow;
  the local MCP contract does not grant server write access.
- User-approved local human corrections can still use override tools. Preserve source + comment,
  exact returned files/occurrences and placeholder validation. Verify effective output in the active
  Dev or a remote Build; verify the stored override separately with the override list tool.
- Entry scanning refreshes extraction without remote callbacks. A standalone remote-mode scan can
  show missing effective translations because it has not loaded a server snapshot. In replace mode this does not prove
  that the server has no translations; do not create local slots to compensate for replace-mode remote gaps.
  An overlay standalone scan describes the local base; an active Dev scan may include its already
  applied remote layer. Neither proves coverage of the service's latest release.
- With mode: 'overlay', local list/set tools still target the local base. Fill local gaps only within
  task authorization; effective remote values precede both local automatic values and human overrides.
  Check stored values separately from effective output. Clearing a local value does not remove a
  server override; removing a server override requires an authorized service operation.
- Scan results identify translation_source as local, remote or overlay. The Codex end check skips automatic
  missing-translation continuation for remote and overlay results; extraction errors still require attention.
- Keep local translations/ and SQLite history intact. A request to use remote data is not permission
  to delete or replace local history or to synchronize local values back to the server.
