import type { SFCBlock } from '@vue/compiler-sfc';
import { SourceMapConsumer, type RawSourceMap } from 'source-map-js';
import type { SourceLocation } from './index.js';

export function createSourceMapLocationMapper(
  map: RawSourceMap,
  fallback?: (location: SourceLocation) => SourceLocation | undefined,
) {
  const consumer = new SourceMapConsumer(map);
  return (location: SourceLocation): SourceLocation => {
    const original = consumer.originalPositionFor(location);
    return original.line == null || original.column == null
      ? (fallback?.(location) ?? location)
      : { line: original.line, column: original.column };
  };
}

export function createBlockLocationMapper(block: SFCBlock) {
  return (location: SourceLocation): SourceLocation => ({
    line: block.loc.start.line + location.line - 1,
    column:
      location.column + (location.line === 1 ? block.loc.start.column - 1 : 0),
  });
}

export function createBlockSourceMapLocationMapper(
  block: SFCBlock,
  map: RawSourceMap,
) {
  const mapLocation = createSourceMapLocationMapper(map);
  const mapBlockLocation = createBlockLocationMapper(block);
  return (location: SourceLocation): SourceLocation =>
    mapBlockLocation(mapLocation(location));
}

export function createCombinedLocationMapper(
  script: SFCBlock,
  templateMapper: (location: SourceLocation) => SourceLocation,
  templateLineOffset: number,
  templateLineCount: number,
) {
  const scriptMapper = createBlockLocationMapper(script);
  const scriptLineCount = countLines(script.content);
  return (location: SourceLocation): SourceLocation => {
    if (location.line <= scriptLineCount) return scriptMapper(location);
    if (
      location.line > templateLineOffset &&
      location.line <= templateLineOffset + templateLineCount
    ) {
      return templateMapper({
        line: location.line - templateLineOffset,
        column: location.column,
      });
    }
    return location;
  };
}

export function identityLocation(location: SourceLocation): SourceLocation {
  return location;
}

export function countLines(value: string): number {
  return value.split('\n').length;
}
