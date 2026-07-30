import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { errorPayload } from './errors.js';
import { AiI18nProjectService } from './project.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const DirectorySchema = z
  .string()
  .min(1)
  .max(1_024)
  .describe(
    'Absolute final ai-i18n directory resolved from the target Vite root and aiI18n.directory.',
  );
const SourceFileSchema = z.string().min(1).max(4_096);
const LocaleSchema = z.string().min(1).max(128);
const CursorSchema = z.string().min(1).max(4_096).optional();
const SourceFilesSchema = z.array(SourceFileSchema).min(1).max(100).optional();
const LocalesSchema = z.array(LocaleSchema).min(1).max(100).optional();
const LimitSchema = z.number().int().min(1).max(500).default(100);
const MessageReferenceSchema = z
  .object({
    source: z.string().min(1).max(100_000),
    comment: z.string().trim().min(1).max(100_000).optional(),
  })
  .strict()
  .describe(
    'Public message identity. The same source and optional comment share one translation across every source file.',
  );
const TranslationTargetSchema = z
  .object({
    message: MessageReferenceSchema,
    locale: LocaleSchema,
  })
  .strict();
const TranslationUpdateSchema = TranslationTargetSchema.extend({
  value: z.string().max(100_000),
});
const OverrideUpdateSchema = TranslationUpdateSchema.extend({
  scope: z
    .enum(['default', 'message'])
    .describe(
      'default affects every occurrence of the source; message targets this comment-specific message.',
    ),
});

export function createAiI18nMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ai-i18n-mcp-server',
    version,
  });
  const project = new AiI18nProjectService();

  server.registerTool(
    'ai_i18n_list_translations',
    {
      title: 'List translations',
      description:
        'Inspect extracted source files and raw translations.json values. Omit source_files on the first call. view defaults to missing and returns one writable message object per shared source and comment; summary returns per-file counts; all returns every message. Follow next_cursor until has_more is false.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          source_files: SourceFilesSchema.describe(
            'Optional exact source paths copied from a previous result.',
          ),
          view: z.enum(['summary', 'missing', 'all']).default('missing'),
          locales: LocalesSchema,
          cursor: CursorSchema,
          limit: LimitSchema,
        })
        .strict(),
      annotations: readAnnotations,
    },
    async (input) => callTool(() => project.listTranslations(input)),
  );

  server.registerTool(
    'ai_i18n_set_translations',
    {
      title: 'Set translation values',
      description:
        'Atomically update raw translations.json values by message source and optional comment. The same message is shared across every source file. Identical duplicate updates are applied once; different values for one target fail the batch. Existing non-null values are protected unless overwrite_existing is true.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          overwrite_existing: z.boolean().default(false),
          updates: z.array(TranslationUpdateSchema).min(1).max(500),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    async (input) => callTool(() => project.setTranslations(input)),
  );

  server.registerTool(
    'ai_i18n_clear_translations',
    {
      title: 'Clear translation values',
      description:
        'Atomically reset selected translations.json values to null by message source and optional comment. Duplicate targets are cleared once. It does not remove messages, locales, extracted files, or overrides.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          targets: z.array(TranslationTargetSchema).min(1).max(500),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    async (input) => callTool(() => project.clearTranslations(input)),
  );

  server.registerTool(
    'ai_i18n_list_overrides',
    {
      title: 'List human review overrides',
      description:
        'List locale-specific values from overrides.json, including orphaned entries. Copy override_id exactly into the delete tool. Omit source_files to include orphaned entries and follow next_cursor until has_more is false.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          source_files: SourceFilesSchema,
          locales: LocalesSchema,
          cursor: CursorSchema,
          limit: LimitSchema,
        })
        .strict(),
      annotations: readAnnotations,
    },
    async (input) => callTool(() => project.listOverrides(input)),
  );

  server.registerTool(
    'ai_i18n_set_overrides',
    {
      title: 'Set human review overrides',
      description:
        'Atomically add or overwrite overrides.json values by message source and optional comment. default scope affects every occurrence of the same source; message scope requires a comment-specific message. Identical duplicate updates are applied once; different values for one target fail the batch.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          updates: z.array(OverrideUpdateSchema).min(1).max(500),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    async (input) => callTool(() => project.setOverrides(input)),
  );

  server.registerTool(
    'ai_i18n_delete_overrides',
    {
      title: 'Delete human review overrides',
      description:
        'Atomically delete locale-specific overrides.json values by exact opaque override_id values returned by ai_i18n_list_overrides.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          override_ids: z.array(z.string().min(1).max(16_384)).min(1).max(500),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    async (input) => callTool(() => project.deleteOverrides(input)),
  );

  return server;
}

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const writeAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

async function callTool<T>(
  operation: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(errorPayload(error)) }],
    };
  }
}
