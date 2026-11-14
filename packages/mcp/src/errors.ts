import { DuplicateJsonKeyError } from '@ai-i18n/core/translation-memory';

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
  if (error instanceof DuplicateJsonKeyError) {
    return {
      error_code: 'DUPLICATE_JSON_KEY',
      file: error.file,
      json_pointer: error.pointer,
      first: error.first,
      duplicate: error.duplicate,
      next_action:
        'Resolve the conflicting JSON values at the reported positions, then retry.',
    };
  }
  if (!(error instanceof McpToolError)) {
    return {
      error_code: 'UNEXPECTED_ERROR',
      message: error instanceof Error ? error.message : String(error),
      next_action:
        'Retry once. If it fails again, report the tool name and error to the user.',
    };
  }
  return {
    error_code: error.code,
    ...error.details,
    next_action:
      ERROR_NEXT_ACTIONS[error.code] ??
      'Inspect the returned details, resolve the issue, then retry.',
  };
}

const ERROR_NEXT_ACTIONS: Record<string, string> = {
  WORKSPACE_DIRECTORY_NOT_ABSOLUTE: 'Pass an absolute workspace_directory.',
  WORKSPACE_NOT_FOUND: 'Choose an existing readable workspace directory.',
  CONFIG_FILE_NOT_ABSOLUTE:
    'Pass the absolute config_file returned by discovery.',
  CONFIG_NOT_FOUND:
    'Discover projects again or select an existing config file.',
  CONFIG_LOADER_UNAVAILABLE:
    'Install a compatible @ai-i18n/vite in the selected app.',
  CONFIG_INVALID: 'Fix the selected configuration and its imports, then retry.',
  INVALID_LOCALE_JSON:
    'Repair the named manual locale JSON file without losing reviewed values.',
  UNKNOWN_LOCALE: 'Select a configured target locale.',
  UNKNOWN_MESSAGE_KEY:
    'Scan and list translations, then copy an exact returned key.',
  TEMPLATE_TOKEN_MISMATCH: 'Keep the same template placeholders as the source.',
  TRANSLATION_CONFLICT:
    'List current manual values and request explicit overwrite authorization.',
};
