# Independent configuration

- Create one ai-i18n.config.ts per app, exporting defineConfig from @ai-i18n/vite/config. Preserve ESM setup (package.json type: module), language values, Provider/remote/cache adapters, and all existing options.
- Leave aiI18n() in vite.config; only configFile is accepted there. Move adapter imports with their options. Keep aiI18nReview in Vite.
- Default lookup is exactly Vite root/ai-i18n.config.ts. Explicit plugin configFile is resolved against Vite root. Do not search ancestors or merge workspace configs for the plugin.
- The independent config's root defaults to its own directory and must match resolved Vite root. All ai-i18n relative directory/dts/log paths use the config directory; source file identity still uses Vite root.
- For a custom Vite root, set config.root and explicit plugin configFile. When moving existing options, resolve directory back to the existing translation directory before editing; never copy or reset translation shards to accommodate config discovery.
- Shared settings use ordinary TS imports. Do not add inheritance or override precedence rules. Configuration factories receive command/mode; preserve the app's chosen environment and explicit loadEnv calls, using a config-relative env directory.
- Verify a public-entry build and scan, and change one locally imported config value to verify Dev restart. Build validation can perform the configured successful-build history cleanup; use an isolated copy when validating against user-owned translation data.
- Core discovery lists config file paths without executing them; app selection and MCP contracts belong to use-ai-i18n-mcp. Pure source workspace packages do not get independent configuration.

- When the missing-translation build gate fails, use its source locations, message IDs, and exact JSON paths to confirm the selected app. Remote diagnostics do not imply local translation shards exist; use the remote workflow.
