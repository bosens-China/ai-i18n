import fs from 'node:fs';
import path from 'node:path';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { createTsconfigResolver } from './tsconfig-projects.js';

const SOURCE_EXTENSIONS = [
  '',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
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

export type ImportAlias = Readonly<Record<string, string>>;

interface AliasEntry {
  find: string;
  replacement: string;
}

export function createImportResolver(
  tsconfigPath?: string,
  alias?: ImportAlias,
) {
  const aliases = normalizeAliases(alias);
  const resolveTsconfig = createTsconfigResolver(tsconfigPath);

  return (specifier: string, importer: string): string | null => {
    if (specifier === 'virtual:ai-i18n') return specifier;
    const aliasCandidate = resolveAlias(specifier, aliases);
    if (aliasCandidate) return probeSource(aliasCandidate);
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

function normalizeAliases(
  alias: ImportAlias | undefined,
): readonly AliasEntry[] {
  return Object.entries(alias ?? {}).map(([find, replacement]) => {
    if (!find) {
      throw new TypeError(
        diagnosticMessage(
          'ai-i18n alias 的匹配键不能为空。',
          'The ai-i18n alias match key must not be empty.',
        ),
      );
    }
    if (typeof replacement !== 'string' || !path.isAbsolute(replacement)) {
      throw new TypeError(
        diagnosticMessage(
          `ai-i18n alias "${find}" 的 replacement 必须是绝对路径。`,
          `The replacement for ai-i18n alias "${find}" must be an absolute path.`,
        ),
      );
    }
    return { find, replacement };
  });
}

function resolveAlias(
  specifier: string,
  aliases: readonly AliasEntry[],
): string | null {
  for (const { find, replacement } of aliases) {
    if (specifier === find || specifier.startsWith(`${find}/`)) {
      return path.normalize(`${replacement}${specifier.slice(find.length)}`);
    }
  }
  return null;
}

function probeSource(candidate: string): string | null {
  candidate = path.normalize(candidate);
  if (/\.(?:cjs|cts)$/i.test(candidate)) return null;
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
