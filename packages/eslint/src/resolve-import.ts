import fs from 'node:fs';
import path from 'node:path';

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

interface TsConfig {
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
}

interface Alias {
  prefix: string;
  suffix: string;
  targets: string[];
}

interface CachedTsConfig {
  stamp: string | null;
  value: TsConfig;
}

interface CachedDirectoryStamp {
  expiresAt: number;
  value: string | null;
}

interface CachedProbe {
  candidateDirectory: string | null;
  parentDirectory: string | null;
  resolved: string | null;
}

const tsconfigCache = new Map<string, CachedTsConfig>();
const directoryStampCache = new Map<string, CachedDirectoryStamp>();
const probeCache = new Map<string, CachedProbe>();

export function createImportResolver(tsconfigPath?: string) {
  const aliases: Alias[] = [];
  let baseUrl = process.cwd();
  if (tsconfigPath) {
    const absoluteConfig = path.resolve(tsconfigPath);
    const config = readTsConfig(absoluteConfig);
    baseUrl = path.resolve(
      path.dirname(absoluteConfig),
      config.compilerOptions?.baseUrl ?? '.',
    );
    for (const [pattern, targets] of Object.entries(
      config.compilerOptions?.paths ?? {},
    )) {
      const star = pattern.indexOf('*');
      aliases.push({
        prefix: star < 0 ? pattern : pattern.slice(0, star),
        suffix: star < 0 ? '' : pattern.slice(star + 1),
        targets,
      });
    }
  }

  return (specifier: string, importer: string): string | null => {
    if (specifier === 'virtual:ai-i18n') return specifier;
    if (specifier.startsWith('.')) {
      return probeSource(path.resolve(path.dirname(importer), specifier));
    }
    for (const alias of aliases) {
      if (
        !specifier.startsWith(alias.prefix) ||
        !specifier.endsWith(alias.suffix)
      ) {
        continue;
      }
      const value = specifier.slice(
        alias.prefix.length,
        specifier.length - alias.suffix.length || undefined,
      );
      for (const target of alias.targets) {
        const candidate = target.includes('*')
          ? target.replace('*', value)
          : target;
        const resolved = probeSource(path.resolve(baseUrl, candidate));
        if (resolved) return resolved;
      }
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

function readTsConfig(filename: string): TsConfig {
  const stamp = readFileStamp(filename);
  const cached = tsconfigCache.get(filename);
  if (cached?.stamp === stamp) return cached.value;
  let value: TsConfig = {};
  try {
    value = JSON.parse(
      stripJsonComments(fs.readFileSync(filename, 'utf8')),
    ) as TsConfig;
  } catch {
    // 无效或不存在的 tsconfig 与未配置路径别名等价。
  }
  tsconfigCache.set(filename, { stamp, value });
  return value;
}

function readFileStamp(filename: string): string | null {
  try {
    const stat = fs.statSync(filename);
    return stat.isFile()
      ? `${stat.mtimeMs}:${stat.ctimeMs}:${stat.size}`
      : null;
  } catch {
    return null;
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

function stripJsonComments(source: string): string {
  let result = '';
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index]!;
    const next = source[index + 1];
    if (quote) {
      result += current;
      if (escaped) escaped = false;
      else if (current === '\\') escaped = true;
      else if (current === quote) quote = '';
      continue;
    }
    if (current === '"' || current === "'") {
      quote = current;
      result += current;
      continue;
    }
    if (current === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (
        index < source.length &&
        !(source[index] === '*' && source[index + 1] === '/')
      ) {
        if (source[index] === '\n') result += '\n';
        index += 1;
      }
      index += 1;
      continue;
    }
    result += current;
  }
  return result.replace(/,\s*([}\]])/g, '$1');
}
