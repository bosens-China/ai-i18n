import path from 'node:path';
import { fail } from './errors.js';
import { loadSqliteAdapter } from './project-candidates.js';

interface CacheManagementInput {
  i18n_directory: string;
  app_directory?: string;
  data_directory?: string;
}

export async function listCacheProjects(
  input: CacheManagementInput & { offset?: number },
) {
  const adapter = await loadSqliteAdapter(input);
  return adapter.listSqliteProjects({
    dataDirectory: input.data_directory,
    offset: input.offset,
  });
}

export async function cleanCache(
  input: CacheManagementInput & {
    scope: 'orphans' | 'project' | 'all';
    project_directory?: string;
    preview_token?: string;
  },
) {
  if (
    input.scope !== 'all' &&
    (!input.project_directory || !path.isAbsolute(input.project_directory))
  )
    fail('SQLITE_PROJECT_REQUIRED');
  if (input.scope === 'all' && input.project_directory)
    fail('SQLITE_INVALID_CLEANUP_SCOPE');
  const adapter = await loadSqliteAdapter(input);
  try {
    return await adapter.cleanSqliteCache({
      dataDirectory: input.data_directory,
      project: input.project_directory,
      scope: input.scope,
      token: input.preview_token,
    });
  } catch {
    fail('SQLITE_CLEANUP_FAILED');
  }
}
