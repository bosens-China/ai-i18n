# Entry scan and Skill-only translation

## Refresh the selected app

Use the scripts bundled with this installed Skill; resolve their paths relative to its directory.
Do not add a public CLI, package script, or copied scanner to the user's app.

```sh
node <skill-directory>/scripts/scan.mjs --root <absolute-app-command-directory>
```

`--root` is the working directory of the app's Vite command, not an override of `vite.config.root`.
The script loads that app's installed `@ai-i18n/vite` and Vite config. Preserve an existing command's
`--config` and `--mode` by passing them to the script. The default mode is `development`.

The scanner uses the client Dev transformation pipeline, starting from configured build inputs,
library entries, or `index.html`. It follows static imports, static dynamic imports, and globs after
Vite expands them, including reachable local workspace source outside the app root. It handles
HTML module imports and the configured Vue/React plugins without executing browser page code.
The current source extractor does not extract translation calls inside HTML inline scripts; the
scan rejects inline Runtime imports or unbound translation APIs. Move those calls to a separate
JS/TS module before retrying. Static HTML text extraction still follows the configured `html` option.

Use repeatable `--entry <path>` only to specify the app's known complete entry set when it cannot be
inferred. Paths are relative to resolved Vite root. Explicit entries replace inferred entries:
do not pass a subset and then claim a whole-app scan. It does not crawl every repository file.
Unreferenced files, prebuilt node_modules, remote scripts, and runtime-only discovered routes are
outside the local entry graph. Build-only route generators and command-specific config branches
may produce a different graph; `--mode production` still uses `command: serve`. When that distinction
matters, report it and use a real Build for production validation instead of claiming equivalence.

A standalone scan disables ai-i18n Provider calls, personal translation cache reuse, history/capacity
cleanup, declaration generation, Review, listening, watching, warmup and dependency optimization.
An active Dev keeps its existing services; scanning does not enqueue new Provider requests and does
not run history cleanup. Already pending Provider work is allowed to finish before scanning. Other application config and Dev plugin hooks still execute; this is
not a text-only read or a guarantee of zero plugin side effects.

The scanner coordinates with the active Dev for the same Vite cache directory. Keep Dev running;
the helper delegates to its authenticated loopback scan endpoint instead of publishing a competing
catalog. A different mode or explicit entry override is rejected while that Dev is active. Stop Dev
before that explicitly requested custom scan. Wait for unrelated Build or destructive translation
operations; do not point multiple app instances at one i18n directory.
A successful scan replaces `extracted/`, refreshes derived `locales/`, and registers missing source
messages as null translation slots while retaining existing translations and human overrides.
It does not create production bundles. Failed traversal or extraction diagnostics stop before
publishing a partial catalog. Storage errors during final persistence must still be reported and
recovered through the existing store; never claim that every filesystem write is globally atomic.

On success, read the final JSON line: `root`, `i18n_directory`, `mode`, `entries`, `file_count`,
`message_count`, `reused`, and per-locale `translated` / `missing`. Use its absolute `i18n_directory` for tools.
Counts describe effective coverage including human overrides; MCP's translation lists describe
automatic Translation Memory and can still show null slots covered by human rules.

On nonzero exit, resolve the reported missing module, ambiguous dynamic import, or extraction
diagnostic before retrying. If code uses runtime-selected imports, identify a finite static route
set with the user instead of silently dropping it. Do not fall back automatically to an expensive
Build. Missing internal exports mean the installed package is too old for this Skill; update the
package within the task scope or report the mismatch. Never patch node_modules.

Run this helper again after source edits and before the final verification; never infer freshness
from a prior successful command alone. The shared scanner reuses a successful catalog when source,
entry, configuration, environment and output digests match. It still reads current translations and
overrides. Cache deletion is safe; missing/modified extracted data and unknown custom transform
plugins force a rescan. This first cache hashes input content and skips extraction, not all file IO.
Reachable files outside the fingerprinted app/pnpm workspace disable reuse. Scan errors and edits
during scanning do not produce a valid cache hit. Review all-page scope and plugin Stop checks use
this same implementation; do not build a separate Skill-side cache.

After a successful scan, use Host MCP when connected. Ordinary translation needs no additional Build.
Destructive orphan deletion retains the separate full Build and approval workflow in the tool contracts.

## Without Host MCP

Ordinary translation can use the same tools in-process with the installed `@ai-i18n/mcp` package.
If absent, install it as a dev dependency of the selected app using its package manager and the
version matching the project (currently alpha), within the user's translation setup scope.
No server registration or Provider credentials are needed.

Write the request as JSON in a temporary file, then run:

```sh
node <skill-directory>/scripts/translations.mjs --root <absolute-app-command-directory> --input <request.json>
```

For example, the first request is:

```json
{
  "name": "ai_i18n_list_translations",
  "arguments": { "i18n_directory": "/absolute/app/i18n" }
}
```

The helper accepts only `ai_i18n_list_translations` and `ai_i18n_set_translations`. Read the tool
contracts linked by `SKILL.md` for inputs, pagination, token preservation, overwrite authorization,
and verification. The envelope is the standard tool result; parse the JSON in `content[0].text`.
An `isError` result exits nonzero; follow its error and `next_action` before retrying. Use JSON files
or stdin, never interpolate copy or translations into shell command text. Remove temporary requests
after use. Review, clearing, and orphan deletion remain Host MCP operations.
