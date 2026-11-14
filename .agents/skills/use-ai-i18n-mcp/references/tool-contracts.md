# MCP tool contracts

Read the installed `@ai-i18n/mcp` README and server schemas when exact field names matter. The app and server may have independent versions, but must share the current storage and key contract.

`ai_i18n_discover_projects` takes absolute `workspace_directory` and returns config candidates without executing them. `ai_i18n_resolve_project` takes absolute `config_file` and resolves the selected Vite app. `ai_i18n_scan_project` takes `config_file` and executes a complete entry scan; use it before translation audits or after edits. Scans write the local SQLite extraction index and final locales, so confirm the intended app before invoking one.

`ai_i18n_list_translations` takes `config_file`, `locale`, `view: 'missing' | 'all'`, and optional `cursor`/`limit`. Follow all pages unless the task is sampled. Use returned `key`, source, comment, and file scope as the identity. Do not guess a file key or decode a source path from the key.

`ai_i18n_set_translations` takes `config_file`, `locale`, `updates: [{ key, value }]`, and optional `overwrite_existing`. It validates the entire batch, rejects unknown identities/locales or invalid placeholders, and writes human input only. Existing manual values are protected unless overwrite is explicitly authorized. `ai_i18n_clear_translations` takes `config_file`, `locale`, and `keys`, and removes only named manual values. Deletion requires the user's instruction. Both report `rebuild_required`; scan or Build to refresh output.

Tool failures include `error_code` and `next_action`. Follow `next_action` before retrying. For a stale or absent index, scan the selected app. For a failed scan, fix the source/configuration issue and retry; do not treat partial SQLite state as complete. For a manual-file conflict, preserve the file and ask which value is intended if the user has not already specified one. Never edit generated locale JSON to make a translation durable.

If no Host MCP connection is available, the bundled `scripts/scan.mjs --root <absolute-app-directory>` runs the same entry scan. The bundled `scripts/translations.mjs --root <absolute-app-directory> --input <request.json>` calls one MCP tool in-process. The JSON request is `{ "name": "ai_i18n_list_translations", "arguments": { "config_file": "<absolute-config>", "locale": "en-US" } }` with the same tool name and arguments schema as a connected MCP call. Follow the same write authorization and verification rules.
