# Register the MCP server

First read the public [Agent setup guide](https://bosens-china.github.io/ai-i18n/ai/ai-tools) and the selected application's installed `@ai-i18n/vite` version. Register one `@ai-i18n/mcp` server compatible with that app; do not create a duplicate connection when the Codex plugin already supplies it. The application and MCP server do not need identical version numbers.

The Codex plugin bundles both Skills and an MCP server definition. Its [repository instructions](../../../../plugins/ai-i18n/README.md) cover installation and update. For a standalone MCP setup, use the host's normal MCP configuration and the package's `ai-i18n-mcp` binary. Check `ai_i18n_discover_projects` after registration before selecting an app. Do not install packages into the target project solely to inspect an already connected server.
