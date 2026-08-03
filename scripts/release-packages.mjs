import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_CONFIG = path.join(ROOT, 'release-please-config.json');
const SMOKE_IMPORTS = {
  '@ai-i18n/analyzer': ['@ai-i18n/analyzer', '@ai-i18n/analyzer/vue'],
  '@ai-i18n/core': [
    '@ai-i18n/core',
    '@ai-i18n/core/diagnostics',
    '@ai-i18n/core/translation-memory',
  ],
  '@ai-i18n/eslint-plugin': ['@ai-i18n/eslint-plugin'],
  '@ai-i18n/mcp': ['@ai-i18n/mcp'],
  '@ai-i18n/openai': ['@ai-i18n/openai'],
  '@ai-i18n/vite': ['@ai-i18n/vite'],
};

function bilingual(zh, en) {
  return `${zh} / ${en}`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(
      `${bilingual(`命令执行失败：${command}`, `Command failed: ${command}`)}${detail ? `\n${detail}` : ''}`,
    );
  }
  return result;
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, 'utf8'));
}

function releasePackages() {
  const config = readJson(RELEASE_CONFIG);
  return Object.keys(config.packages).map((relativePath) => {
    const directory = path.join(ROOT, relativePath);
    const manifest = readJson(path.join(directory, 'package.json'));
    return { directory, manifest, relativePath };
  });
}

function isPublished({ name, version }) {
  // 普通功能提交仍沿用已发布版本；Release Please 提升版本后才进入候选验证。
  const result = run(
    'npm',
    ['view', `${name}@${version}`, 'version', '--json'],
    {
      allowFailure: true,
      capture: true,
    },
  );
  if (result.status === 0) return true;
  const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (/E404|404 Not Found|is not in this registry/i.test(detail)) return false;
  throw new Error(
    `${bilingual(`无法查询 npm 版本 ${name}@${version}`, `Unable to query npm version ${name}@${version}`)}\n${detail}`,
  );
}

function tarballEntries(directory) {
  return readdirSync(directory)
    .filter((filename) => filename.endsWith('.tgz'))
    .map((filename) => {
      const tarball = path.join(directory, filename);
      const result = run('tar', ['-xOf', tarball, 'package/package.json'], {
        capture: true,
      });
      return { manifest: JSON.parse(result.stdout), tarball };
    });
}

function packPackages(packages, directory) {
  for (const item of packages) {
    run('pnpm', [
      '--dir',
      item.directory,
      'pack',
      '--pack-destination',
      directory,
    ]);
  }
  const entries = tarballEntries(directory);
  if (entries.length !== packages.length) {
    throw new Error(
      bilingual(
        `预期生成 ${packages.length} 个 tarball，实际为 ${entries.length} 个。`,
        `Expected ${packages.length} tarballs, received ${entries.length}.`,
      ),
    );
  }
  return entries;
}

export function collectExportTargets(manifest) {
  const targets = new Set();
  const visit = (value) => {
    if (typeof value === 'string') {
      if (value.startsWith('./')) targets.add(value);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const child of Object.values(value)) visit(child);
  };
  visit(manifest.exports);
  visit(manifest.main);
  visit(manifest.types);
  visit(manifest.bin);
  return [...targets].sort();
}

export function validateInternalDependencies(manifest, workspaceVersions) {
  for (const section of ['dependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      const expected = workspaceVersions.get(name);
      if (!expected) continue;
      if (version !== expected) {
        throw new Error(
          bilingual(
            `${manifest.name} 必须精确依赖 ${name}@${expected}，当前为 ${version}。`,
            `${manifest.name} must depend exactly on ${name}@${expected}; received ${version}.`,
          ),
        );
      }
    }
  }
}

function validateTarball(entry, workspaceVersions) {
  validateInternalDependencies(entry.manifest, workspaceVersions);
  const result = run('tar', ['-tf', entry.tarball], { capture: true });
  const files = new Set(result.stdout.trim().split('\n'));
  for (const target of collectExportTargets(entry.manifest)) {
    const archived = `package/${target.slice(2)}`;
    if (!files.has(archived)) {
      throw new Error(
        bilingual(
          `${entry.manifest.name} 的发布入口 ${target} 不在 tarball 中。`,
          `Published entry ${target} is missing from the ${entry.manifest.name} tarball.`,
        ),
      );
    }
  }
}

export function sortPackageEntries(entries) {
  // 使用依赖优先的拓扑排序，避免 Analyzer 先于本批 Core 上传。
  const byName = new Map(entries.map((entry) => [entry.manifest.name, entry]));
  const dependencies = new Map();
  const dependents = new Map(entries.map((entry) => [entry.manifest.name, []]));
  for (const entry of entries) {
    const names = Object.keys(entry.manifest.dependencies ?? {}).filter(
      (name) => byName.has(name),
    );
    dependencies.set(entry.manifest.name, new Set(names));
    for (const name of names) dependents.get(name).push(entry.manifest.name);
  }

  const ready = entries
    .map((entry) => entry.manifest.name)
    .filter((name) => dependencies.get(name).size === 0)
    .sort();
  const sorted = [];
  while (ready.length) {
    const name = ready.shift();
    sorted.push(byName.get(name));
    for (const dependent of dependents.get(name).sort()) {
      const pending = dependencies.get(dependent);
      pending.delete(name);
      if (pending.size === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  if (sorted.length !== entries.length) {
    throw new Error(
      bilingual(
        '发布包内部依赖存在循环，无法确定发布顺序。',
        'Internal release dependencies contain a cycle; publish order is undefined.',
      ),
    );
  }
  return sorted;
}

function workspaceYaml(entries) {
  // pnpm 11 的 overrides 位于 workspace 配置，用本批 tarball 覆盖尚未上 npm 的依赖。
  const overrides = entries
    .map(
      ({ manifest, tarball }) =>
        `  ${JSON.stringify(manifest.name)}: ${JSON.stringify(`file:${tarball}`)}`,
    )
    .join('\n');
  return `packages:\n  - .\noverrides:\n${overrides}\n`;
}

function smokeImports(entries) {
  return [
    ...new Set(
      entries.flatMap(
        ({ manifest }) => SMOKE_IMPORTS[manifest.name] ?? [manifest.name],
      ),
    ),
  ];
}

function verifyConsumer(entries, directory) {
  const { packageManager } = readJson(path.join(ROOT, 'package.json'));
  const dependencies = Object.fromEntries(
    entries.map(({ manifest, tarball }) => [manifest.name, `file:${tarball}`]),
  );
  writeFileSync(
    path.join(directory, 'package.json'),
    `${JSON.stringify(
      {
        name: 'ai-i18n-release-smoke',
        private: true,
        type: 'module',
        packageManager,
        dependencies,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(directory, 'pnpm-workspace.yaml'),
    workspaceYaml(entries),
  );
  const imports = smokeImports(entries);
  writeFileSync(
    path.join(directory, 'smoke.mjs'),
    `${imports.map((specifier) => `await import(${JSON.stringify(specifier)});`).join('\n')}\nconsole.log(${JSON.stringify(bilingual(`已验证 ${imports.length} 个发布入口。`, `Verified ${imports.length} release entries.`))});\n`,
  );
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], {
    cwd: directory,
  });
  run('node', ['smoke.mjs'], { cwd: directory });
}

function verifyEntries(entries) {
  if (!entries.length) {
    console.log(
      bilingual(
        'npm 上没有待发布的新版本，跳过 tarball 冒烟。',
        'No unpublished npm versions found; skipping tarball smoke test.',
      ),
    );
    return;
  }
  const versions = new Map(
    releasePackages().map(({ manifest }) => [manifest.name, manifest.version]),
  );
  for (const entry of entries) validateTarball(entry, versions);
  sortPackageEntries(entries);
  const consumer = mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-consumer-'));
  try {
    verifyConsumer(entries, consumer);
  } finally {
    rmSync(consumer, { force: true, recursive: true });
  }
}

function verifyUnpublished() {
  const unpublished = releasePackages().filter(
    ({ manifest }) => !isPublished(manifest),
  );
  if (!unpublished.length) return verifyEntries([]);
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-pack-'));
  try {
    const packDirectory = path.join(temporary, 'tarballs');
    mkdirSync(packDirectory, { recursive: true });
    verifyEntries(packPackages(unpublished, packDirectory));
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function main() {
  const [command, directory] = process.argv.slice(2);
  if (command === 'verify') return verifyUnpublished();
  if (command === 'verify-dir' && directory) {
    return verifyEntries(tarballEntries(path.resolve(directory)));
  }
  if (command === 'order' && directory) {
    for (const entry of sortPackageEntries(
      tarballEntries(path.resolve(directory)),
    )) {
      console.log(path.basename(entry.tarball));
    }
    return;
  }
  throw new Error(
    bilingual(
      '用法：release-packages.mjs verify | verify-dir <目录> | order <目录>',
      'Usage: release-packages.mjs verify | verify-dir <directory> | order <directory>',
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
