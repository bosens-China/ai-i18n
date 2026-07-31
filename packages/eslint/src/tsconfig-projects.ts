import fs from 'node:fs';
import path from 'node:path';
import {
  createFilesMatcher,
  createPathsMatcher,
  parseTsconfig,
  type FileMatcher,
  type PathsMatcher,
  type TsConfigResult,
} from 'get-tsconfig';
import picomatch from 'picomatch';

const PROJECT_CACHE_TTL_MS = 250;
const MAX_PROJECT_CACHE_ENTRIES = 1_000;
const READ_FILE_CACHE_PREFIX = 'readFileSync:';
const READ_FILE_CACHE_SUFFIX = ':utf8';

interface TsConfigProject {
  config: TsConfigResult;
  filesMatcher: FileMatcher;
  pathsMatcher: PathsMatcher | null;
}

interface CachedProjectGraph {
  expiresAt: number;
  projects: TsConfigProject[];
  stamps: Map<string, string | null>;
}

interface CachedDiscovery {
  expiresAt: number;
  configPath: string | null;
}

const projectGraphCache = new Map<string, CachedProjectGraph>();
const discoveryCache = new Map<string, CachedDiscovery>();

export function createTsconfigResolver(tsconfigPath?: string) {
  const explicitRoot = tsconfigPath
    ? path.normalize(path.resolve(tsconfigPath))
    : undefined;

  return (specifier: string, importer: string): readonly string[] => {
    const rootConfig = explicitRoot ?? findNearestProjectConfig(importer);
    if (!rootConfig) return [];
    const project = selectProject(loadProjectGraph(rootConfig), importer);
    return project?.pathsMatcher?.(specifier) ?? [];
  };
}

function findNearestProjectConfig(importer: string): string | null {
  let directory = path.dirname(path.resolve(importer));
  const now = Date.now();
  const cached = discoveryCache.get(directory);
  if (cached && cached.expiresAt > now) return cached.configPath;
  const visited: string[] = [];

  for (;;) {
    visited.push(directory);
    for (const filename of ['tsconfig.json', 'jsconfig.json']) {
      const candidate = path.join(directory, filename);
      if (isFile(candidate)) {
        cacheDiscovery(visited, candidate, now);
        return candidate;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      cacheDiscovery(visited, null, now);
      return null;
    }
    directory = parent;
  }
}

function cacheDiscovery(
  directories: readonly string[],
  configPath: string | null,
  now: number,
) {
  if (discoveryCache.size >= MAX_PROJECT_CACHE_ENTRIES) {
    discoveryCache.clear();
  }
  for (const directory of directories) {
    discoveryCache.set(directory, {
      expiresAt: now + PROJECT_CACHE_TTL_MS,
      configPath,
    });
  }
}

function loadProjectGraph(rootConfig: string): readonly TsConfigProject[] {
  const cached = projectGraphCache.get(rootConfig);
  if (cached && projectGraphIsFresh(cached)) return cached.projects;

  const projects: TsConfigProject[] = [];
  const stamps = new Map<string, string | null>();
  const parsingCache = new Map<string, string>();
  const visited = new Set<string>();
  visitProject(rootConfig, projects, stamps, parsingCache, visited);

  if (projectGraphCache.size >= MAX_PROJECT_CACHE_ENTRIES) {
    projectGraphCache.clear();
  }
  projectGraphCache.set(rootConfig, {
    expiresAt: Date.now() + PROJECT_CACHE_TTL_MS,
    projects,
    stamps,
  });
  return projects;
}

function visitProject(
  filename: string,
  projects: TsConfigProject[],
  stamps: Map<string, string | null>,
  parsingCache: Map<string, string>,
  visited: Set<string>,
) {
  filename = path.normalize(path.resolve(filename));
  if (visited.has(filename)) return;
  visited.add(filename);
  stamps.set(filename, readFileStamp(filename));

  let config: TsConfigResult;
  try {
    config = {
      path: filename,
      config: parseTsconfig(filename, parsingCache),
    };
    captureParsedConfigStamps(parsingCache, stamps);
  } catch {
    return;
  }

  // references 按声明顺序优先于 solution config 本身，匹配具体项目后再回退根配置。
  for (const reference of config.config.references ?? []) {
    const referenced = resolveReference(filename, reference.path);
    if (referenced) {
      visitProject(referenced, projects, stamps, parsingCache, visited);
    }
  }

  try {
    projects.push({
      config,
      filesMatcher: createProjectFilesMatcher(config),
      pathsMatcher: createCompatiblePathsMatcher(config),
    });
  } catch {
    // 无效的 include、exclude 或 paths 与当前项目不提供 alias 等价。
  }
}

function createProjectFilesMatcher(config: TsConfigResult): FileMatcher {
  if (
    path.basename(config.path).toLowerCase() !== 'jsconfig.json' ||
    config.config.compilerOptions?.allowJs !== undefined
  ) {
    return createFilesMatcher(config);
  }
  return createFilesMatcher({
    ...config,
    config: {
      ...config.config,
      compilerOptions: {
        ...config.config.compilerOptions,
        allowJs: true,
      },
    },
  });
}

function captureParsedConfigStamps(
  parsingCache: ReadonlyMap<string, unknown>,
  stamps: Map<string, string | null>,
) {
  // get-tsconfig 的共享缓存会列出 extends 链读取过的文件，一并纳入失效判断。
  for (const key of parsingCache.keys()) {
    if (
      !key.startsWith(READ_FILE_CACHE_PREFIX) ||
      !key.endsWith(READ_FILE_CACHE_SUFFIX)
    ) {
      continue;
    }
    const filename = key.slice(
      READ_FILE_CACHE_PREFIX.length,
      -READ_FILE_CACHE_SUFFIX.length,
    );
    stamps.set(filename, readFileStamp(filename));
  }
}

function createCompatiblePathsMatcher(
  config: TsConfigResult,
): PathsMatcher | null {
  const compilerOptions = config.config.compilerOptions;
  const paths = compilerOptions?.paths;
  if (!paths || compilerOptions.baseUrl) return createPathsMatcher(config);

  // TS 5.x/6.x 接受无 baseUrl 时不带 "./" 的 target；get-tsconfig 默认更严格。
  const compatiblePaths = Object.fromEntries(
    Object.entries(paths).map(([pattern, targets]) => [
      pattern,
      targets.map((target) =>
        path.isAbsolute(target) || target.startsWith('.')
          ? target
          : `./${target}`,
      ),
    ]),
  );
  return createPathsMatcher({
    path: config.path,
    config: {
      ...config.config,
      compilerOptions: {
        ...compilerOptions,
        paths: compatiblePaths,
      },
    },
  });
}

function resolveReference(
  ownerConfig: string,
  referencePath: string,
): string | null {
  const candidate = path.resolve(path.dirname(ownerConfig), referencePath);
  const attempts = [
    candidate,
    candidate.endsWith('.json') ? candidate : `${candidate}.json`,
    path.join(candidate, 'tsconfig.json'),
  ];
  return attempts.find(isFile) ?? null;
}

function selectProject(
  projects: readonly TsConfigProject[],
  importer: string,
): TsConfigProject | undefined {
  const absoluteImporter = path.resolve(importer);
  return projects.find((project) =>
    projectMatchesImporter(project, absoluteImporter),
  );
}

function projectMatchesImporter(
  project: TsConfigProject,
  importer: string,
): boolean {
  if (path.extname(importer) !== '.vue') {
    return Boolean(project.filesMatcher(importer));
  }
  return matchesExplicitVueInput(project.config, importer);
}

function matchesExplicitVueInput(
  { config, path: configPath }: TsConfigResult,
  importer: string,
): boolean {
  const directory = path.dirname(configPath);
  const relative = normalizePath(path.relative(directory, importer));
  if (relative.startsWith('../')) return false;

  if (
    config.files?.some(
      (file) => path.resolve(directory, file) === path.resolve(importer),
    )
  ) {
    return true;
  }
  if (config.exclude?.some((pattern) => matchesExclude(relative, pattern))) {
    return false;
  }
  return Boolean(
    config.include?.some(
      (pattern) =>
        pattern.includes('.vue') &&
        picomatch.isMatch(relative, normalizePath(pattern), { dot: true }),
    ),
  );
}

function matchesExclude(relative: string, pattern: string): boolean {
  pattern = normalizePath(pattern).replace(/\/+$/, '');
  return (
    picomatch.isMatch(relative, pattern, { dot: true }) ||
    picomatch.isMatch(relative, `${pattern}/**`, { dot: true })
  );
}

function projectGraphIsFresh(cached: CachedProjectGraph): boolean {
  if (cached.expiresAt <= Date.now()) return false;
  for (const [filename, stamp] of cached.stamps) {
    if (readFileStamp(filename) !== stamp) return false;
  }
  return true;
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

function isFile(filename: string): boolean {
  try {
    return fs.statSync(filename).isFile();
  } catch {
    return false;
  }
}

function normalizePath(filename: string): string {
  return filename.replaceAll('\\', '/');
}
