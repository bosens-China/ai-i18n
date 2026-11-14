# Configuration and migration

Read the target app's installed `@ai-i18n/vite` types and the public [configuration guide](https://bosens-china.github.io/ai-i18n/guide/basic/configuration) before editing. Retain framework mode, locales, default language, `autoImport`, `loading`, and declaration preferences unless asked to change them. Ensure `aiI18n()` is present once and the app's Vite config loader works for explicit scanning.

Target locales are always split into async resources; `loading` only configures `preload` and `prefetch` hints. Do not promise eager bundling when `loading` is omitted or false.

The minimum runtime is Node.js 22.13.0 because extraction uses `node:sqlite`. Vite 8 alone starts at Node.js 22.12.0. The SQLite file is worktree-local under `node_modules/.cache/ai-i18n/`; never commit or share it. A Build or `ai_i18n_scan_project` recreates it from reachable source.

Persistent manual files are `i18n/locales/<locale>.manual.json` for global keys and `i18n/locales/files/<locale>.manual.json` for file keys. Both contain key→string. Generated `i18n/locales/<locale>.json` and `i18n/locales/files/<locale>/*.json` are final key→string resources; do not edit them to create durable translations. Copy file keys from MCP results.

On migration, preserve legacy `overrides/` until a successful full scan. Automatic migration accepts only rules that map without ambiguity. Old file rules require calls marked `{ scope: 'file' }`; occurrence rules require full coverage. Resolve reported conflicts manually. Old automatic `translations/` are removed by the new Build; if their values must become durable, first copy approved values into manual files. The adapter may return service translations during Build, but ai-i18n does not persist its raw response.

Do not restore browser-side remote overrides. A server translation source belongs inside the Build adapter and its key mapping is the caller's responsibility. Check output with both a normal build and an adapter returning `null`; a prior adapter result must not silently survive the latter.
