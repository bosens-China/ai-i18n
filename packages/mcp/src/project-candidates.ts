import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail } from './errors.js';
import { cacheMessage, loadProject } from './project-files.js';
import { resolveTargets } from './project-targets.js';
import type { MessageReference } from './project.js';

export interface ListCacheCandidatesInput {
  i18n_directory: string;
  message: MessageReference;
  locale: string;
  data_directory?: string;
  app_directory?: string;
}

/** 只查询已保存的 SQLite 候选；普通 MCP 列表和写入不触碰个人缓存。 */
export async function listCacheCandidates(input: ListCacheCandidatesInput) {
  if (input.data_directory && !path.isAbsolute(input.data_directory))
    fail('SQLITE_DATA_DIRECTORY_NOT_ABSOLUTE');
  if (input.app_directory && !path.isAbsolute(input.app_directory))
    fail('SQLITE_APP_DIRECTORY_NOT_ABSOLUTE');
  const project = await loadProject(input.i18n_directory);
  const [target] = resolveTargets(project, [input]);
  const message = cacheMessage(project, target!.message);
  const resolver = createRequire(
    path.join(
      input.app_directory ?? project.directory,
      '.ai-i18n-sqlite-resolve.cjs',
    ),
  );
  let packagePath: string;
  try {
    packagePath = resolver.resolve('@ai-i18n/sqlite');
  } catch {
    fail('SQLITE_ADAPTER_NOT_FOUND');
  }
  const adapter = (await import(pathToFileURL(packagePath).href)) as {
    listSqliteCandidates: (
      target: {
        sourceLang: string;
        targetLang: string;
        source: string;
        comment?: string;
      },
      options?: { dataDirectory?: string },
    ) => Promise<string[]>;
  };
  if (typeof adapter.listSqliteCandidates !== 'function')
    fail('SQLITE_ADAPTER_OUTDATED');
  const values = await adapter.listSqliteCandidates(
    {
      sourceLang: message.sourceLang,
      targetLang: input.locale,
      source: message.source,
      ...(message.comment ? { comment: message.comment } : {}),
    },
    input.data_directory ? { dataDirectory: input.data_directory } : undefined,
  );
  return {
    message: input.message,
    locale: input.locale,
    current_value: message.translations[input.locale] ?? null,
    candidates: values.slice(0, 10),
    has_more: values.length > 10,
  };
}
