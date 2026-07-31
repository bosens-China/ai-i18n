import path from 'node:path';
import { extractedPath } from '../src/file-store-paths';

export function extractedTestPath(root: string, source: string): string {
  return extractedPath(path.join(root, 'i18n'), source);
}
