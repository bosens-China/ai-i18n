export function locationOf(source: string, value: string) {
  const lines = source.slice(0, source.indexOf(value)).split('\n');
  return { line: lines.length, column: lines.at(-1)?.length ?? 0 };
}
