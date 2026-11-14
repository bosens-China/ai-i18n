---
name: use-ai-i18n-mcp
description: Use ai-i18n MCP to resolve a Vite app, explicitly scan reachable messages, inspect missing translations, and write or clear durable manual translations. Use for Agent translation tasks and migration audits.
---

# Use ai-i18n MCP

Read [tool contracts](references/tool-contracts.md) before calling the server. Read the public [documentation index](https://bosens-china.github.io/ai-i18n/llms.txt) only for product behavior. The MCP server and app require Node.js 22.13+.

1. Discover `ai-i18n.config.ts` with `ai_i18n_discover_projects({ workspace_directory })`, unless the user specified an exact config. Discovery does not execute configuration. Resolve a single target with `ai_i18n_resolve_project({ config_file })`; never combine multiple apps or infer a source path from a hash.
2. Run `ai_i18n_scan_project({ config_file })` when the index is missing or source, configuration, branch, or manual values changed. This scans Vite entries without a full Build, rebuilds the local SQLite index, runs the optional adapter, and generates final locales. Dev does not perform this work.
3. Page through `ai_i18n_list_translations({ config_file, locale, view: 'missing' | 'all' })`. Copy returned keys exactly, including file identities and comments. A comment is a distinct translation identity; file scope falls back only to the matching global identity.
4. With user authorization to translate, write selected values using `ai_i18n_set_translations`. It writes only `.manual.json`; do not overwrite an existing manual value without explicit instruction. Use `ai_i18n_clear_translations` only when deletion was requested.
5. Scan again and list again to verify effective values and emitted resources. A write returns `rebuild_required: true`; it does not update a running browser or generated JSON by itself.

For server registration read [registration](references/registration.md); for errors, authorization boundaries, and result fields, follow [tool contracts](references/tool-contracts.md). If an application is not integrated, use `integrate-ai-i18n` first.
