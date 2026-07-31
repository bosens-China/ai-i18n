import { createHash } from 'node:crypto';

export function hashExtractedSource(source: string): string {
  return createHash('sha256')
    .update(source.replaceAll('\\', '/'))
    .digest('hex');
}

export function encodeLegacyExtractedSource(source: string): string {
  return source
    .replaceAll('\\', '/')
    .split('/')
    .map((segment) => encodeURIComponent(segment).replaceAll('_', '%5F'))
    .join('_');
}
