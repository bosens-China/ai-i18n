# Error recovery

## Empty or stale extraction

If the first translation list returns no source files, run one full Build for the same target app and
retry once. If the retry remains empty, report that the build has no extracted messages. Do not scan
sibling apps.

## MCP errors

| Error | Recovery |
| --- | --- |
| `I18N_DIRECTORY_NOT_FOUND` or `I18N_DIRECTORY_NOT_ABSOLUTE` | Recompute Vite root plus `aiI18n.directory`, then use an absolute path. |
| `REQUIRED_PROTOCOL_FILE_MISSING` or `REQUIRED_PROTOCOL_DIRECTORY_MISSING` | Run one full Build for the same app and retry once. |
| `SOURCE_FILE_NOT_FOUND` | Correct the exact `source_files` filter using paths returned by the list tool. |
| `MESSAGE_NOT_FOUND` | List again and copy the exact returned `message` object. |
| `DUPLICATE_TARGET_CONFLICT` | Choose one value for the repeated message and locale, then retry the batch. |
| `TRANSLATION_CONFLICT` | Re-list current values. Set `overwrite_existing: true` only with explicit user approval. |
| `TEMPLATE_TOKEN_MISMATCH` | Preserve every template token before retrying. |
| `MESSAGE_SCOPE_REQUIRES_COMMENT` | Use message scope only for a listed message with a static comment. |
| `UNKNOWN_LOCALE` | Use locale values from `aiI18n({ locales })`, not display labels. |
| `INVALID_CURSOR` | Restart the corresponding list without the cursor. |
| `INVALID_OVERRIDE_ID` | List overrides again and copy the returned ID exactly. |

## Tool unavailable

If the MCP tools are unavailable, explain that `@ai-i18n/mcp` must be registered locally. Do not
silently replace the workflow with broad source-tree editing or direct protocol-file writes.
