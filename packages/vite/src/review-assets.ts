import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REVIEW_BASE_PATH } from './review-page.js';

export interface ReviewAsset {
  body: Buffer;
  contentType: string;
  html: boolean;
}

const bundledRoot = fileURLToPath(new URL('./review-ui/', import.meta.url));

export async function readReviewAsset(
  pathname: string,
): Promise<ReviewAsset | undefined> {
  const relative = assetPath(pathname);
  if (!relative) return undefined;

  for (const root of assetRoots()) {
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${path.resolve(root)}${path.sep}`)) continue;
    try {
      return {
        body: await fs.readFile(filename),
        contentType: contentType(filename),
        html: path.extname(filename) === '.html',
      };
    } catch (cause) {
      if (!isMissing(cause)) throw cause;
    }
  }
  return undefined;
}

function assetRoots(): string[] {
  const developmentRoot = process.env.AI_I18N_REVIEW_UI_DIR;
  return developmentRoot ? [developmentRoot, bundledRoot] : [bundledRoot];
}

function assetPath(pathname: string): string | undefined {
  if (!pathname.startsWith(REVIEW_BASE_PATH)) return undefined;
  const relative = pathname.slice(REVIEW_BASE_PATH.length);
  if (!relative || relative.startsWith('api/') || relative.includes('\0')) {
    return undefined;
  }
  const normalized = path.posix.normalize(relative);
  return normalized === '..' || normalized.startsWith('../')
    ? undefined
    : normalized;
}

function contentType(filename: string): string {
  switch (path.extname(filename)) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
    case '.map':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function isMissing(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
  );
}
