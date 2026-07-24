export function encodeExtractedSource(source: string): string {
  return source
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment).replaceAll('_', '%5F'))
    .join('_');
}

export function decodeExtractedSource(filename: string): string | undefined {
  try {
    return filename
      .split('_')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
  } catch {
    return undefined;
  }
}
