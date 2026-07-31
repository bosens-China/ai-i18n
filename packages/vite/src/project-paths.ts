import path from 'node:path';
import { normalizePath } from 'vite';

const WINDOWS_ABSOLUTE_RE = /^[A-Za-z]:\//;

export function normalizeProjectId(root: string, id: string): string | null {
  const cleanId = normalizePath(id.split('?')[0]!.replaceAll('\\', '/'));
  if (cleanId.includes('/node_modules/') || cleanId.startsWith('\0'))
    return null;
  const cleanRoot = normalizePath(root.replaceAll('\\', '/'));
  if (WINDOWS_ABSOLUTE_RE.test(cleanId)) {
    if (
      !WINDOWS_ABSOLUTE_RE.test(cleanRoot) ||
      cleanId.slice(0, 2).toLowerCase() !== cleanRoot.slice(0, 2).toLowerCase()
    ) {
      return null;
    }
    return normalizePath(
      path.win32.relative(cleanRoot, cleanId).replaceAll('\\', '/'),
    );
  }
  if (!path.isAbsolute(cleanId)) return cleanId;
  return normalizePath(path.relative(cleanRoot, cleanId));
}

export function resolutionKey(importer: string, specifier: string): string {
  return `${importer}\0${specifier}`;
}
