import type MagicString from 'magic-string';
import { translationOccurrenceKey } from '@ai-i18n/core';
import type { SourceLocation } from './extractor.js';

const OCCURRENCE_METHOD = '__aiI18nAt';

export function instrumentTranslationOccurrences(
  transformed: MagicString,
  source: string,
  locations: readonly SourceLocation[],
): void {
  const starts = lineStarts(source);
  const seen = new Set<string>();
  for (const location of locations) {
    const key = translationOccurrenceKey(location);
    if (seen.has(key)) continue;
    seen.add(key);
    const start = sourceOffset(source, starts, location);
    if (start === undefined) continue;
    const invocation = invocationOffset(source, start);
    if (invocation === undefined) continue;
    transformed.appendLeft(
      invocation,
      `.${OCCURRENCE_METHOD}(${JSON.stringify(key)})`,
    );
  }
}

function lineStarts(source: string): number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

function sourceOffset(
  source: string,
  starts: readonly number[],
  location: SourceLocation,
): number | undefined {
  const lineStart = starts[location.line - 1];
  if (lineStart === undefined) return undefined;
  const lineEnd = source.indexOf('\n', lineStart);
  const end = lineEnd === -1 ? source.length : lineEnd;
  const offset = lineStart + location.column;
  return offset <= end ? offset : undefined;
}

function invocationOffset(source: string, start: number): number | undefined {
  let squareDepth = 0;
  let braceDepth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      index = skipLineComment(source, index + 2);
      continue;
    }
    if (char === '/' && next === '*') {
      index = skipBlockComment(source, index + 2);
      continue;
    }
    if (char === '"' || char === "'") {
      index = skipQuoted(source, index + 1, char);
      continue;
    }
    if (char === '`') {
      if (squareDepth === 0 && braceDepth === 0) return index;
      index = skipTemplate(source, index + 1);
      continue;
    }
    if (char === '[') squareDepth += 1;
    else if (char === ']') squareDepth -= 1;
    else if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth -= 1;
    else if (char === '(' && squareDepth === 0 && braceDepth === 0) {
      return source.slice(Math.max(start, index - 2), index) === '?.'
        ? index - 2
        : index;
    }
    if (squareDepth < 0 || braceDepth < 0) return undefined;
  }
  return undefined;
}

function skipLineComment(source: string, start: number): number {
  const end = source.indexOf('\n', start);
  return end === -1 ? source.length : end;
}

function skipBlockComment(source: string, start: number): number {
  const end = source.indexOf('*/', start);
  return end === -1 ? source.length : end + 1;
}

function skipQuoted(source: string, start: number, quote: string): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === quote) return index;
  }
  return source.length;
}

function skipTemplate(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === '`') return index;
  }
  return source.length;
}
