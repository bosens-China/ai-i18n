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
  offset?: number;
  source_offset?: number;
  value?: string;
}

/** 只查询已保存的 SQLite 候选，不同步或采用候选。 */
export async function listCacheCandidates(input: ListCacheCandidatesInput) {
  if (input.data_directory && !path.isAbsolute(input.data_directory))
    fail('SQLITE_DATA_DIRECTORY_NOT_ABSOLUTE');
  if (input.app_directory && !path.isAbsolute(input.app_directory))
    fail('SQLITE_APP_DIRECTORY_NOT_ABSOLUTE');
  const project = await loadProject(input.i18n_directory);
  const [target] = resolveTargets(project, [input]);
  const message = cacheMessage(project, target!.message);
  const adapter = await loadSqliteAdapter(input);
  const page = await adapter.listSqliteCandidates(
    {
      sourceLang: message.sourceLang,
      targetLang: input.locale,
      source: message.source,
      ...(message.comment ? { comment: message.comment } : {}),
    },
    {
      dataDirectory: input.data_directory,
      offset: input.offset,
      sourceOffset: input.source_offset,
      value: input.value,
    },
  );
  return {
    message: input.message,
    locale: input.locale,
    current_automatic_value: message.translations[input.locale] ?? null,
    candidates: page.candidates.map((candidate) => ({
      value: candidate.value,
      sources: candidate.sources,
      sources_has_more: candidate.sourcesHasMore,
    })),
    has_more: page.hasMore,
    next_offset: page.hasMore ? (input.offset ?? 0) + 10 : null,
    automatic_value: page.automaticValue ?? null,
  };
}

export async function loadSqliteAdapter(input: {
  i18n_directory: string;
  app_directory?: string;
  data_directory?: string;
}) {
  for (const directory of [
    input.i18n_directory,
    input.app_directory,
    input.data_directory,
  ])
    if (directory && !path.isAbsolute(directory))
      fail('SQLITE_DIRECTORY_NOT_ABSOLUTE');
  const resolver = createRequire(
    path.join(
      input.app_directory ?? input.i18n_directory,
      '.ai-i18n-sqlite-resolve.cjs',
    ),
  );
  let packagePath: string;
  try {
    packagePath = resolver.resolve('@ai-i18n/sqlite');
  } catch {
    fail('SQLITE_ADAPTER_NOT_FOUND');
  }
  const adapter = (await import(
    pathToFileURL(packagePath).href
  )) as typeof import('@ai-i18n/sqlite');
  return adapter;
}
