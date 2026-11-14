import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export function repositoryRoot(root: string): string {
  let current = path.resolve(root);
  while (true) {
    if (existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(root);
    current = parent;
  }
}

export function repositoryPath(root: string, file: string): string {
  return path
    .relative(repositoryRoot(root), path.resolve(file))
    .replaceAll('\\', '/');
}

export function fileId(root: string, file: string): string {
  return createHash('sha256')
    .update(repositoryPath(root, file))
    .digest('hex')
    .slice(0, 16);
}

export function fileMessageKey(id: string, messageId: string): string {
  return `f:${id}:${messageId}`;
}
