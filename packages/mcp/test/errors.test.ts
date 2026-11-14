import { expect, test } from 'vitest';
import { errorPayload, McpToolError } from '../src/errors';

test('always returns an actionable recovery step', () => {
  expect(
    errorPayload(
      new McpToolError('UNKNOWN_MESSAGE_KEY', {
        key: 'missing',
      }),
    ),
  ).toMatchObject({
    error_code: 'UNKNOWN_MESSAGE_KEY',
    key: 'missing',
    next_action: expect.stringContaining('copy an exact returned key'),
  });
  expect(errorPayload(new McpToolError('FUTURE_ERROR'))).toMatchObject({
    error_code: 'FUTURE_ERROR',
    next_action: expect.any(String),
  });
  expect(errorPayload(new McpToolError('TRANSLATION_CONFLICT'))).toMatchObject({
    error_code: 'TRANSLATION_CONFLICT',
    next_action: expect.stringContaining('explicit overwrite authorization'),
  });
  expect(errorPayload(new Error('internal detail'))).toEqual({
    error_code: 'UNEXPECTED_ERROR',
    message: 'internal detail',
    next_action:
      'Retry once. If it fails again, report the tool name and error to the user.',
  });
});
