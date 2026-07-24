import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  AiI18nProjectService,
  type TranslationFileItem,
  type TranslationItem,
} from './project.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const DirectorySchema = z
  .string()
  .min(1)
  .max(1_024)
  .describe(
    'Absolute path to the final ai-i18n output directory. Read the Vite config and resolve aiI18n.directory against the Vite root before calling the tool.',
  );
const CursorSchema = z.string().min(1).max(4_096).optional();
const LocationSchema = z.object({
  line: z.number().int(),
  column: z.number().int(),
});
const FileItemSchema = z.object({
  file: z.string(),
  message_count: z.number().int(),
  missing_count: z.number().int(),
  missing_by_locale: z.record(z.string(), z.number().int()),
});
const TranslationItemSchema = z.object({
  message_id: z.string(),
  source: z.string(),
  comment: z.string().optional(),
  translations: z.record(z.string(), z.string().nullable()),
  missing_locales: z.array(z.string()),
  file: z.string(),
  occurrence_count: z.number().int(),
  locations: z.array(LocationSchema).optional(),
});

export function createAiI18nMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ai-i18n-mcp-server',
    version,
  });
  const project = new AiI18nProjectService();

  server.registerTool(
    'ai_i18n_list_translation_files',
    {
      title: 'List ai-i18n files needing translation',
      description:
        'List source files with effective null translations. Before calling, read the Vite config and pass the absolute path to the final ai-i18n output directory.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          locale: z.string().min(1).max(128).optional(),
          cursor: CursorSchema,
          limit: z.number().int().min(1).max(200).default(50),
        })
        .strict(),
      outputSchema: pageSchema(FileItemSchema),
      annotations: readAnnotations,
    },
    async (input) => {
      return callTool(() => project.listFiles(input), formatFileSummary);
    },
  );

  server.registerTool(
    'ai_i18n_list_translations',
    {
      title: 'List ai-i18n translation content',
      description:
        'List effective translation messages from cache plus extracted files. Use file to scope to one source file; missing_only defaults to true. Results use cursor pagination and default to 100 messages.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          file: z.string().min(1).max(4_096).optional(),
          locale: z.string().min(1).max(128).optional(),
          missing_only: z.boolean().default(true),
          cursor: CursorSchema,
          limit: z.number().int().min(1).max(200).default(100),
        })
        .strict(),
      outputSchema: pageSchema(TranslationItemSchema),
      annotations: readAnnotations,
    },
    async (input) => {
      return callTool(
        () => project.listTranslations(input),
        formatTranslationSummary,
      );
    },
  );

  server.registerTool(
    'ai_i18n_write_translations',
    {
      title: 'Fill missing ai-i18n translations',
      description:
        'Atomically fill null translations in one extracted source file. The tool never overwrites a different non-null value. Run Vite Dev or Build to reconcile cache, duplicate extracted files, and locales.',
      inputSchema: z
        .object({
          i18n_directory: DirectorySchema,
          file: z.string().min(1).max(4_096),
          translations: z
            .array(
              z
                .object({
                  message_id: z.string().min(1).max(16_384),
                  locale: z.string().min(1).max(128),
                  value: z.string().max(100_000),
                })
                .strict(),
            )
            .min(1)
            .max(100),
        })
        .strict(),
      outputSchema: z.object({
        file: z.string(),
        applied_count: z.number().int(),
        unchanged_count: z.number().int(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      return callTool(
        () => project.writeTranslations(input),
        (result) =>
          `Applied ${result.applied_count} translation(s) in ${result.file}; ${result.unchanged_count} already matched.`,
      );
    },
  );

  return server;
}

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    total_count: z.number().int(),
    count: z.number().int(),
    items: z.array(item),
    has_more: z.boolean(),
    next_cursor: z.string().optional(),
    truncated_by_size: z.boolean(),
  });
}

async function callTool<T extends object>(
  operation: () => Promise<T>,
  summarize: (result: T) => string,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    return {
      content: [{ type: 'text', text: summarize(result) }],
      structuredContent: Object.fromEntries(Object.entries(result)),
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: errorMessage(error) }],
    };
  }
}

function formatFileSummary(result: {
  total_count: number;
  count: number;
  items: TranslationFileItem[];
}): string {
  return `Found ${result.total_count} file(s) needing translation; returned ${result.count}.`;
}

function formatTranslationSummary(result: {
  total_count: number;
  count: number;
  items: TranslationItem[];
}): string {
  return `Found ${result.total_count} translation message(s); returned ${result.count}.`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : '[ai-i18n/mcp] unexpected error while processing tool call';
}
