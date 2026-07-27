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
  return error instanceof McpToolError
    ? { error_code: error.code, ...error.details }
    : { error_code: 'UNEXPECTED_ERROR' };
}
