import { expect, it } from 'vitest';
import { DuplicateJsonKeyError, parseProtocolJson } from '../src/protocol-json';

it('recognizes escaped keys and structurally identical values without conflating separate objects', () => {
  const parsed = parseProtocolJson(
    String.raw`{"a":{"x":[1,"a\"b",null],"y":true},"\u0061":{"y":true,"x":[1,"a\"b",null]},"items":[{"x":1},{"x":2}],"__proto__":1,"__proto__":1}`,
    'data.json',
  );
  expect(parsed.duplicateCount).toBe(2);
  expect(Object.hasOwn(parsed.value as object, '__proto__')).toBe(true);
  expect(
    parseProtocolJson('[true,false,null,{},[],1,"x"]', 'data.json')
      .duplicateCount,
  ).toBe(0);
});

it.each(['\n', '\r\n', '\r'])(
  'reports key positions with %j line endings and an escaped JSON Pointer',
  (newline) => {
    const text = ['{', ' "a/b~": 1,', ' "a/b~": 2', '}'].join(newline);
    expect(() => parseProtocolJson(text, '/data.json')).toThrowError(
      DuplicateJsonKeyError,
    );
    try {
      parseProtocolJson(text, '/data.json');
    } catch (error) {
      expect(error).toMatchObject({
        file: '/data.json',
        pointer: '/a~1b~0',
        first: { line: 2, column: 2 },
        duplicate: { line: 3, column: 2 },
      });
    }
  },
);

it('rejects nested conflicts, last-value masking and numbers that would lose precision', () => {
  for (const text of [
    '{"a":1,"a":2,"a":1}',
    '{"a":{"b":1,"b":2},"a":{"b":2}}',
    '{"a":9007199254740992,"a":9007199254740993}',
    '{"a":[1,2],"a":[2,1]}',
    '{"a":null,"a":""}',
  ])
    expect(() => parseProtocolJson(text, 'data.json')).toThrowError(
      DuplicateJsonKeyError,
    );
});

it('retains native JSON syntax validation', () => {
  for (const text of [
    '{"a":1,}',
    '{"a":undefined}',
    '{"a":1 "a":1}',
    '[] trailing',
  ]) {
    expect(() => parseProtocolJson(text, 'data.json')).toThrowError(
      SyntaxError,
    );
  }
});
