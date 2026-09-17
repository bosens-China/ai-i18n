import { diagnosticMessage } from './diagnostics.js';

export class DuplicateJsonKeyError extends SyntaxError {
  readonly zh: string;
  readonly en: string;
  constructor(
    readonly file: string,
    readonly pointer: string,
    readonly first: { line: number; column: number },
    readonly duplicate: { line: number; column: number },
  ) {
    const zh = `[ai-i18n] JSON 文件“${file}”在 ${duplicate.line}:${duplicate.column} 存在值冲突的重复键 ${pointer}（首次位于 ${first.line}:${first.column}）。请确认并保留一个值；文件未自动清理。`;
    const en = `[ai-i18n] Conflicting duplicate JSON key ${pointer} in "${file}" at ${duplicate.line}:${duplicate.column} (first at ${first.line}:${first.column}). Resolve the values before retrying; the file was not automatically cleaned.`;
    super(diagnosticMessage(zh, en));
    this.zh = zh;
    this.en = en;
    this.name = 'DuplicateJsonKeyError';
  }
}

/** 原生解析负责语法；逐对象检查键，避免 JSON.parse 丢弃重复项后才开始校验。 */
export function parseProtocolJson(text: string, file: string) {
  const value: unknown = JSON.parse(text);
  const tokens = text.matchAll(
    /"(?:[^"\\]|\\[\s\S])*"|[{}[\],:]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g,
  );
  let token = tokens.next().value!;
  let duplicateCount = 0;
  const advance = () => {
    token = tokens.next().value!;
  };
  const location = (offset: number) => {
    const lines = text.slice(0, offset).split(/\r\n|\r|\n/);
    return {
      line: lines.length,
      column: lines.at(-1)!.length + 1,
    };
  };
  function inspect(pointer: string): string {
    const literal = token[0];
    advance();
    if (literal === '{') {
      const members = new Map<string, { normalized: string; offset: number }>();
      while (token[0] !== '}') {
        const key = JSON.parse(token[0]) as string;
        const offset = token.index!;
        advance(); // 冒号
        advance();
        const child = `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        const normalized = inspect(child);
        const previous = members.get(key);
        if (previous) {
          if (previous.normalized !== normalized) {
            throw new DuplicateJsonKeyError(
              file,
              child,
              location(previous.offset),
              location(offset),
            );
          }
          duplicateCount++;
        } else members.set(key, { normalized, offset });
        if (token[0] === ',') advance();
      }
      advance();
      return (
        '{' +
        [...members]
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, member]) => JSON.stringify(key) + ':' + member.normalized)
          .join(',') +
        '}'
      );
    }
    if (literal === '[') {
      const items: string[] = [];
      while (token[0] !== ']') {
        items.push(inspect(`${pointer}/${items.length}`));
        if (token[0] === ',') advance();
      }
      advance();
      return '[' + items.join(',') + ']';
    }
    // 数字保留原始表示，避免大整数被 Number 舍入后误判成相同值并删除。
    return literal.startsWith('"')
      ? JSON.stringify(JSON.parse(literal))
      : literal;
  }
  inspect('');
  return { value, duplicateCount };
}
