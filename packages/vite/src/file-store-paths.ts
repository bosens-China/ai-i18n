import path from 'node:path';
import { hashExtractedSource } from './extracted-path.js';

export function isInternalStoreFile(directory: string, file: string): boolean {
  const relative = path
    .relative(directory, path.resolve(file))
    .split(path.sep)
    .join('/');
  // 只识别本协议目录内的 journal 和 atomically 临时文件，避免屏蔽同名业务文件。
  return (
    /^(?:translations|overrides)\/\.transaction\.json$/.test(relative) ||
    /^(?:translations|overrides|extracted|locales)\/.+\.json\.tmp-\d{10}[a-f0-9]{6}$/.test(
      relative,
    )
  );
}

export function translationOverridesPath(directory: string): string {
  return path.join(directory, 'overrides');
}

export function localePath(directory: string, locale: string): string {
  return path.join(directory, 'locales', `${encodeURIComponent(locale)}.json`);
}

export function extractedPath(directory: string, source: string): string {
  return path.join(
    directory,
    'extracted',
    `${hashExtractedSource(source)}.json`,
  );
}
