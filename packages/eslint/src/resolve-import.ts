import fs from 'node:fs';
import path from 'node:path';
import { createTsconfigResolver } from './tsconfig-projects.js';

const SOURCE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
] as const;
const DIRECTORY_STAMP_TTL_MS = 250;
const MAX_PROBE_CACHE_ENTRIES = 10_000;

interface CachedDirectoryStamp {
  expiresAt: number;
  value: string | null;
}

interface CachedProbe {
  candidateDirectory: string | null;
  parentDirectory: string | null;
  resolved: string | null;
}

const directoryStampCache = new Map<string, CachedDirectoryStamp>();
const probeCache = new Map<string, CachedProbe>();

export function createImportResolver(tsconfigPath?: string) {
  const resolveTsconfig = createTsconfigResolver(tsconfigPath);

  return (specifier: string, importer: string): string | null => {
    if (specifier === 'virtual:ai-i18n') return specifier;
    if (specifier.startsWith('.')) {
      return probeSource(path.resolve(path.dirname(importer), specifier));
    }
    for (const candidate of resolveTsconfig(specifier, importer)) {
      const resolved = probeSource(candidate);
      if (resolved) return resolved;
    }
    return null;
  };
}

function probeSource(candidate: string): string | null {
  candidate = path.normalize(candidate);
  const cached = probeCache.get(candidate);
  if (
    cached &&
    cached.parentDirectory === readDirectoryStamp(path.dirname(candidate)) &&
    cached.candidateDirectory === readDirectoryStamp(candidate)
  ) {
    return cached.resolved;
  }

  let resolved: string | null = null;
  for (const extension of SOURCE_EXTENSIONS) {
    const file = `${candidate}${extension}`;
    if (isFile(file)) {
      resolved = path.normalize(file);
      break;
    }
  }
  if (!resolved) {
    for (const extension of SOURCE_EXTENSIONS.slice(1)) {
      const file = path.join(candidate, `index${extension}`);
      if (isFile(file)) {
        resolved = path.normalize(file);
        break;
      }
    }
  }
  if (probeCache.size >= MAX_PROBE_CACHE_ENTRIES) probeCache.clear();
  probeCache.set(candidate, {
    parentDirectory: readDirectoryStamp(path.dirname(candidate)),
    candidateDirectory: readDirectoryStamp(candidate),
    resolved,
  });
  return resolved;
}

function isFile(file: string) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function readDirectoryStamp(directory: string): string | null {
  const now = Date.now();
  const cached = directoryStampCache.get(directory);
  if (cached && cached.expiresAt > now) return cached.value;
  let value: string | null = null;
  try {
    const stat = fs.statSync(directory);
    if (stat.isDirectory()) {
      value = `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`;
    }
  } catch {
    // 不存在的目录也要缓存，避免重复的失败探测。
  }
  if (directoryStampCache.size >= MAX_PROBE_CACHE_ENTRIES) {
    directoryStampCache.clear();
  }
  directoryStampCache.set(directory, {
    expiresAt: now + DIRECTORY_STAMP_TTL_MS,
    value,
  });
  return value;
}
