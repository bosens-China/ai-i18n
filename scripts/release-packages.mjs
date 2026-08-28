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
import {
  collectExportTargets,
  createPublishManifest,
  diagnosticMessage,
  parsePublishPaths,
  sortPackageEntries,
  validateInternalDependencies,
} from './release-package-metadata.mjs';

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
  '@ai-i18n/sqlite': ['@ai-i18n/sqlite'],
  '@ai-i18n/vite': [
    '@ai-i18n/vite',
    '@ai-i18n/vite/review',
    '@ai-i18n/vite/review/runtime',
  ],
};

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
      `${diagnosticMessage(`命令执行失败：${command}`, `Command failed: ${command}`)}${detail ? `\n${detail}` : ''}`,
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
    `${diagnosticMessage(`无法查询 npm 版本 ${name}@${version}`, `Unable to query npm version ${name}@${version}`)}\n${detail}`,
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
      diagnosticMessage(
        `预期生成 ${packages.length} 个 tarball，实际为 ${entries.length} 个。`,
        `Expected ${packages.length} tarballs, received ${entries.length}.`,
      ),
    );
  }
  return entries;
}

function validateTarball(entry, workspaceVersions) {
  validateInternalDependencies(entry.manifest, workspaceVersions);
  const result = run('tar', ['-tf', entry.tarball], { capture: true });
  const files = new Set(result.stdout.trim().split('\n'));
  for (const target of collectExportTargets(entry.manifest)) {
    const archived = `package/${target.slice(2)}`;
    if (!files.has(archived)) {
      throw new Error(
        diagnosticMessage(
          `${entry.manifest.name} 的发布入口 ${target} 不在 tarball 中。`,
          `Published entry ${target} is missing from the ${entry.manifest.name} tarball.`,
        ),
      );
    }
  }
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
    `${imports.map((specifier) => `await import(${JSON.stringify(specifier)});`).join('\n')}\nconsole.log(${JSON.stringify(diagnosticMessage(`已验证 ${imports.length} 个发布入口。`, `Verified ${imports.length} release entries.`))});\n`,
  );
  run('pnpm', ['install', '--ignore-scripts', '--no-frozen-lockfile'], {
    cwd: directory,
  });
  run('node', ['smoke.mjs'], { cwd: directory });
}

function verifyEntries(entries) {
  if (!entries.length) {
    console.log(
      diagnosticMessage(
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

function selectPackages(publishPaths) {
  const packages = releasePackages();
  if (publishPaths === undefined) {
    return packages.filter(({ manifest }) => !isPublished(manifest));
  }
  const selectedPaths = parsePublishPaths(
    publishPaths,
    packages.map(({ relativePath }) => relativePath),
  );
  const packageByPath = new Map(
    packages.map((item) => [item.relativePath, item]),
  );
  return selectedPaths.map((relativePath) => packageByPath.get(relativePath));
}

function writePublishManifest(entries, packages, directory) {
  const manifest = createPublishManifest(entries, packages);
  writeFileSync(
    path.join(directory, 'publish-manifest.json'),
    `${JSON.stringify({ packages: manifest }, null, 2)}\n`,
  );
  writeFileSync(
    path.join(directory, 'publish-order.txt'),
    manifest.length
      ? `${manifest.map(({ tarball }) => tarball).join('\n')}\n`
      : '',
  );
}

function preparePackages(directory, publishPaths) {
  mkdirSync(directory, { recursive: true });
  const existingTarballs = readdirSync(directory).filter((filename) =>
    filename.endsWith('.tgz'),
  );
  if (existingTarballs.length) {
    throw new Error(
      diagnosticMessage(
        `发布目录必须不包含已有 tarball：${directory}`,
        `The release directory must not contain existing tarballs: ${directory}`,
      ),
    );
  }

  const packages = selectPackages(publishPaths);
  if (!packages.length) {
    verifyEntries([]);
    writePublishManifest([], [], directory);
    return;
  }
  const entries = packPackages(packages, directory);
  verifyEntries(entries);
  writePublishManifest(entries, packages, directory);
}

function verifyUnpublished() {
  const temporary = mkdtempSync(path.join(os.tmpdir(), 'ai-i18n-pack-'));
  try {
    const packDirectory = path.join(temporary, 'tarballs');
    preparePackages(packDirectory);
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function main() {
  const [command, argument, publishPaths] = process.argv.slice(2);
  if (command === 'verify') return verifyUnpublished();
  if (command === 'validate-paths' && argument) {
    return parsePublishPaths(
      argument,
      releasePackages().map(({ relativePath }) => relativePath),
    );
  }
  if (command === 'prepare-dir' && argument) {
    return preparePackages(path.resolve(argument), publishPaths);
  }
  if (command === 'verify-dir' && argument) {
    return verifyEntries(tarballEntries(path.resolve(argument)));
  }
  if (command === 'order' && argument) {
    for (const entry of sortPackageEntries(
      tarballEntries(path.resolve(argument)),
    )) {
      console.log(path.basename(entry.tarball));
    }
    return;
  }
  throw new Error(
    diagnosticMessage(
      '用法：release-packages.mjs verify | validate-paths <JSON> | prepare-dir <目录> [publish_paths JSON] | verify-dir <目录> | order <目录>',
      'Usage: release-packages.mjs verify | validate-paths <JSON> | prepare-dir <directory> [publish_paths JSON] | verify-dir <directory> | order <directory>',
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
