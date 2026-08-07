export type McpErrorDetails = Record<string, unknown>;

export class McpToolError extends Error {
  constructor(
    readonly code: string,
    readonly details: McpErrorDetails = {},
  ) {
    super(code);
    this.name = 'McpToolError';
  }
}

export function fail(code: string, details: McpErrorDetails = {}): never {
  throw new McpToolError(code, details);
}

export function errorPayload(error: unknown): McpErrorDetails {
  if (!(error instanceof McpToolError)) {
    return {
      error_code: 'UNEXPECTED_ERROR',
      next_action:
        'Retry the tool once. If it fails again, report the tool name and this error code to the user.',
    };
  }
  return {
    error_code: error.code,
    ...error.details,
    next_action: nextAction(error.code),
  };
}

function nextAction(code: string): string {
  return (
    ERROR_NEXT_ACTIONS[code] ??
    'Retry the tool once. If it fails again, report this error code and the returned details to the user.'
  );
}

const ERROR_NEXT_ACTIONS: Record<string, string> = {
  I18N_DIRECTORY_NOT_ABSOLUTE:
    'Resolve the target Vite root and aiI18n.directory, then retry with the resulting absolute i18n_directory.',
  I18N_DIRECTORY_NOT_FOUND:
    'Confirm the target Vite app, run one full Vite Build, then retry with its absolute i18n_directory.',
  I18N_DIRECTORY_NOT_DIRECTORY:
    'Resolve i18n_directory to the ai-i18n directory instead of a file, then retry.',
  REQUIRED_PROTOCOL_FILE_MISSING:
    'Run one full Vite Build for the target app, then retry the same MCP call once.',
  REQUIRED_PROTOCOL_DIRECTORY_MISSING:
    'Run one full Vite Build for the target app, then retry the same MCP call once.',
  INVALID_PROTOCOL_JSON:
    'Restore or repair the named JSON file, run one full Vite Build, then retry.',
  INVALID_PROTOCOL_FILE:
    'Restore or repair the named protocol file, run one full Vite Build, then retry.',
  PROTOCOL_PATH_NOT_DIRECTORY:
    'Restore the named protocol path as a directory, run one full Vite Build, then retry.',
  DUPLICATE_EXTRACTED_SOURCE:
    'Remove the duplicate extracted JSON files for source_file, run one full Vite Build, then retry.',
  MESSAGE_ID_SOURCE_CONFLICT:
    'Run one full Vite Build with a clean extracted directory, then retry. Report the conflicting sources if it persists.',
  MESSAGE_MISSING_FROM_TRANSLATIONS:
    'Run one full Vite Build for the target app, then list translations again.',
  MESSAGE_METADATA_MISMATCH:
    'Run one full Vite Build for the target app, then list translations again.',
  SOURCE_FILE_NOT_FOUND:
    'Call ai_i18n_list_translations with view summary and without source_files, then copy an exact returned source_file before retrying.',
  MESSAGE_NOT_FOUND:
    'Call ai_i18n_list_translations again and copy the exact returned message object before retrying.',
  MESSAGE_NOT_FOUND_IN_SOURCE_FILE:
    'Call ai_i18n_list_translations with include_source_files true, then choose only exact source_file values that contain this message.',
  UNKNOWN_LOCALE:
    'Choose one of available_locales and retry; do not use a display label as the locale value.',
  DUPLICATE_TARGET_CONFLICT:
    'Keep one value for the returned message and locale, remove the conflicting duplicate, then retry the batch.',
  DUPLICATE_TARGET: 'Remove repeated targets from the request, then retry.',
  TRANSLATION_CONFLICT:
    'List current translations again. Use overwrite_existing only after the user explicitly approves replacing them.',
  TEMPLATE_TOKEN_MISMATCH:
    'Add every entry from missing_tokens, remove every entry from unexpected_tokens, then retry with the corrected value.',
  INVALID_CURSOR:
    'Restart the same list call without cursor, then continue with the new next_cursor values.',
  INVALID_OVERRIDE_ID:
    'Call ai_i18n_list_overrides again and copy the returned override_id exactly before retrying.',
  INVALID_ORPHAN_ID:
    'Run one full Vite Build, call ai_i18n_list_orphan_messages again, and copy the returned orphan_id exactly.',
  ORPHAN_MESSAGE_REACTIVATED:
    'Do not delete the returned orphan_ids. Run one full Vite Build, list orphan messages again, show the refreshed result to the user, and request deletion approval again.',
  ORPHAN_ID_CONFLICT:
    'Stop orphan cleanup and report this error code and orphan_id to the user; do not retry deletion.',
};
