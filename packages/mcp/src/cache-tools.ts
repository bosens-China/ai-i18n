import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { listCacheProjects, cleanCache } from './project-cache-management.js';
import { listCacheCandidates } from './project-candidates.js';

export function registerCacheTools(
  server: McpServer,
  DirectorySchema: z.ZodString,
  MessageReferenceSchema: z.ZodObject<{
    source: z.ZodString;
    comment: z.ZodOptional<z.ZodString>;
  }>,
  callTool: (operation: () => Promise<unknown>) => Promise<CallToolResult>,
  readAnnotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  },
) {
  server.registerTool(
    'ai_i18n_list_cache_candidates',
    {
      title: 'List optional SQLite translation candidates',
      description:
        'Read a page of up to ten distinct eligible SQLite suggestions with provenance for one exact active message and locale. This optional tool never writes project JSON or SQLite, and suggestions must be chosen explicitly before using set_translations. Requires @ai-i18n/sqlite installed in the target app. Pass app_directory when i18n_directory is outside the app, and data_directory when sqlite({ dataDirectory }) differs from the default.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          message: MessageReferenceSchema,
          locale: z.string().min(1).max(128),
          data_directory: DirectorySchema.optional(),
          offset: z.number().int().min(0).max(1_000_000).optional(),
          source_offset: z.number().int().min(0).max(1_000_000).optional(),
          value: z.string().optional(),
          app_directory: DirectorySchema.optional(),
        })
        .strict(),
      annotations: readAnnotations,
    },
    async (input) => callTool(() => listCacheCandidates(input)),
  );

  const cacheManagementSchema = {
    i18n_directory: DirectorySchema,
    app_directory: DirectorySchema.optional(),
    data_directory: DirectorySchema.optional(),
  };
  server.registerTool(
    'ai_i18n_list_cache_projects',
    {
      title: 'List personal cache projects',
      description:
        'Read projects contributing to the personal SQLite cache, counts, and last sync times. Does not check source project existence.',
      inputSchema: z
        .object({
          ...cacheManagementSchema,
          offset: z.number().int().min(0).max(1_000_000).optional(),
        })
        .strict(),
      annotations: readAnnotations,
    },
    async (input) => callTool(() => listCacheProjects(input)),
  );
  server.registerTool(
    'ai_i18n_clean_cache',
    {
      title: 'Preview or clean personal cache',
      description:
        'Preview SQLite cleanup by scope: orphans for one project, project, or all. Execute only after user authorization by returning the preview token in preview_token. A changed cache requires a new preview. Never edits project JSON.',
      inputSchema: z
        .object({
          ...cacheManagementSchema,
          scope: z.enum(['orphans', 'project', 'all']),
          project_directory: DirectorySchema.optional(),
          preview_token: z.string().length(64).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => callTool(() => cleanCache(input)),
  );
}
