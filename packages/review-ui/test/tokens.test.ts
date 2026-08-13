import { describe, expect, it } from 'vitest';
import { extractTokens, validateTokens } from '../src/tokens';

describe('review tokens', () => {
  it('extracts runtime tokens in a stable order', () => {
    expect(extractTokens('Hello {{1}}, {{0}} and {{0}}')).toEqual([
      '{{0}}',
      '{{0}}',
      '{{1}}',
    ]);
  });

  it('rejects translations that lose or change runtime tokens', () => {
    expect(validateTokens('Hello {{0}}', '你好 {{0}}')).toBe(true);
    expect(validateTokens('Hello {{0}}', '你好')).toBe(false);
    expect(validateTokens('Hello {{0}}', '你好 {{1}}')).toBe(false);
  });
});
