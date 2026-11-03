# Discover and resolve one app

1. Use the user's explicit config when supplied. Otherwise call ai_i18n_discover_projects with an absolute workspace_directory, or use the Skill helper to invoke the same tool when Host MCP is unavailable.
2. Discovery returns config_file and app_directory only. It does not execute configs, infer effective roots, or inspect translations. Hidden directories, node_modules, dist/dist-ssr/build/coverage/vendor/i18n and directory symlinks are skipped. A truncated result requires narrowing the workspace. Explicit config paths can target excluded locations or custom filenames.
3. If the request does not identify one of several candidates, ask which app. Never select the first result or write all discovered apps. Do not execute every candidate to guess a target.
4. Resolve only the chosen trusted config through ai_i18n_resolve_project. Config and imports execute, but this operation does not load vite.config or invoke Provider. Pass the intended command/mode; default serve/development is not a substitute for a user's internal/production build mode.
5. Use returned i18n_directory exactly. app_directory is the config directory for dependency resolution; vite_root is the source identity root. A source-only workspace package is not a separate target.
6. Scan using the helper's --root (app_directory), --i18n-config (config_file), --mode, and explicit --config/--configLoader when used by the app. It still loads Vite for alias, framework and virtual-module transforms; the selected config must match the app's registered config.
7. Project writes retain i18n_directory. Also pass config_file, config_command and config_mode from selection so cache synchronization uses the same config environment. Normal write authorization and overwrite protections still apply.

Config resolution returns paths, languages and local/remote mode only. Never print Provider objects, credentials, or the whole loaded config. Missing config or mismatched roots require fixing the setup, not silently using another app. Configuration changes require refreshing the scan; old extracted files do not establish current completeness.
