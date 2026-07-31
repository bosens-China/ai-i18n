import { createHash } from 'node:crypto';

export function hashExtractedSource(source: string): string {
  return createHash('sha256')
    .update(source.replaceAll('\\', '/'))
    .digest('hex');
}
