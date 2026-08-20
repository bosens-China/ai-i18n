import { expect, test } from 'vitest';
import { errorPayload, McpToolError } from '../src/errors';

test('always returns an actionable recovery step', () => {
  expect(
    errorPayload(
      new McpToolError('SOURCE_FILE_NOT_FOUND', {
        source_file: 'src/missing.ts',
      }),
    ),
  ).toMatchObject({
    error_code: 'SOURCE_FILE_NOT_FOUND',
    source_file: 'src/missing.ts',
    next_action: expect.stringContaining('ai_i18n_list_translations'),
  });
  expect(errorPayload(new McpToolError('FUTURE_ERROR'))).toMatchObject({
    error_code: 'FUTURE_ERROR',
    next_action: expect.any(String),
  });
  expect(
    errorPayload(new McpToolError('ORPHAN_MESSAGE_REACTIVATED')),
  ).toMatchObject({
    error_code: 'ORPHAN_MESSAGE_REACTIVATED',
    next_action: expect.stringContaining('list orphan messages again'),
  });
  expect(
    errorPayload(new McpToolError('MESSAGE_NOT_FOUND_AT_SOURCE_LOCATION')),
  ).toMatchObject({
    error_code: 'MESSAGE_NOT_FOUND_AT_SOURCE_LOCATION',
    next_action: expect.stringContaining('include_occurrences'),
  });
  expect(errorPayload(new Error('internal detail'))).toEqual({
    error_code: 'UNEXPECTED_ERROR',
    next_action:
      'Retry the tool once. If it fails again, report the tool name and this error code to the user.',
  });
});
