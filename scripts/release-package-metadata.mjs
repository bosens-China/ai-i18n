import path from 'node:path';

const CHINESE_TIME_ZONES = new Set(['Asia/Shanghai', 'Asia/Urumqi']);

export function diagnosticMessage(zh, en) {
  const value = process.env.AI_I18N_DIAGNOSTIC_LOCALE;
  const automaticLocale = CHINESE_TIME_ZONES.has(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  )
    ? 'zh-CN'
    : 'en-US';
  if (!value || value === 'auto') return automaticLocale === 'zh-CN' ? zh : en;
  if (value === 'zh-CN') return zh;
  if (value === 'en-US') return en;
  throw new Error(
    automaticLocale === 'zh-CN'
      ? `[ai-i18n] 不支持 AI_I18N_DIAGNOSTIC_LOCALE“${value}”；应为“auto”“zh-CN”或“en-US”。`
      : `[ai-i18n] Unsupported AI_I18N_DIAGNOSTIC_LOCALE "${value}"; expected "auto", "zh-CN", or "en-US".`,
  );
}

export function parsePublishPaths(value, allowedPaths) {
  let paths;
  try {
    paths = JSON.parse(value);
  } catch {
    throw new Error(
      diagnosticMessage(
        'publish_paths 必须是 JSON 数组。',
        'publish_paths must be a JSON array.',
      ),
    );
  }

  const allowed = new Set(allowedPaths);
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.some((item) => typeof item !== 'string' || !allowed.has(item)) ||
    new Set(paths).size !== paths.length
  ) {
    throw new Error(
      diagnosticMessage(
        `publish_paths 只能包含不重复的发布包路径：${[...allowed].join(', ')}`,
        `publish_paths must contain unique release package paths: ${[...allowed].join(', ')}`,
      ),
    );
  }
  return paths;
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
          diagnosticMessage(
            `${manifest.name} 必须精确依赖 ${name}@${expected}，当前为 ${version}。`,
            `${manifest.name} must depend exactly on ${name}@${expected}; received ${version}.`,
          ),
        );
      }
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
      diagnosticMessage(
        '发布包内部依赖存在循环，无法确定发布顺序。',
        'Internal release dependencies contain a cycle; publish order is undefined.',
      ),
    );
  }
  return sorted;
}

export function createPublishManifest(entries, packages) {
  const packageByName = new Map(
    packages.map((item) => [item.manifest.name, item]),
  );
  return sortPackageEntries(entries).map((entry) => {
    const item = packageByName.get(entry.manifest.name);
    if (!item) {
      throw new Error(
        diagnosticMessage(
          `找不到 ${entry.manifest.name} 对应的发布包路径。`,
          `Unable to find the release package path for ${entry.manifest.name}.`,
        ),
      );
    }
    return {
      name: entry.manifest.name,
      path: item.relativePath,
      tarball: path.basename(entry.tarball),
      version: entry.manifest.version,
    };
  });
}
