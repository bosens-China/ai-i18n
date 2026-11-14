import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { registerDiscoveryTools } from './discovery-tools.js';
import { errorPayload } from './errors.js';
import {
  editRepositoryTranslations,
  listRepositoryTranslations,
} from './repository-project.js';

const { version } = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

const ConfigFile = z.string().min(1).max(4096);
const Locale = z.string().min(1).max(128);
const Key = z.string().min(1).max(100_000);
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

export function createAiI18nMcpServer(): McpServer {
  const server = new McpServer({ name: 'ai-i18n-mcp-server', version });
  registerDiscoveryTools(server, callTool);
  server.registerTool(
    'ai_i18n_list_translations',
    {
      title: 'List translation identities',
      description:
        'Read active identities from the repository-local SQLite extraction index and effective values from manual and generated locale JSON. Run ai_i18n_scan_project first. File identities include a stable key and source path; the key is the write target.',
      inputSchema: z
        .object({
          config_file: ConfigFile,
          locale: Locale,
          view: z.enum(['missing', 'all']).default('missing'),
          source_contains: z.string().min(1).max(10_000).optional(),
          cursor: Key.optional(),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .strict(),
      annotations: readAnnotations,
    },
    (input) => callTool(() => listRepositoryTranslations(input)),
  );
  server.registerTool(
    'ai_i18n_set_translations',
    {
      title: 'Set manual translations',
      description:
        'Write manual key-value JSON for active global or file identities. Manual values outrank the adapter. Run ai_i18n_scan_project or Build afterwards to refresh generated resources. Existing manual values are protected unless overwrite_existing is true.',
      inputSchema: z
        .object({
          config_file: ConfigFile,
          locale: Locale,
          overwrite_existing: z.boolean().default(false),
          updates: z
            .array(
              z
                .object({
                  key: Key,
                  value: z.string().max(100_000),
                })
                .strict(),
            )
            .min(1)
            .max(500),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    (input) => callTool(() => editRepositoryTranslations(input)),
  );
  server.registerTool(
    'ai_i18n_clear_translations',
    {
      title: 'Clear manual translations',
      description:
        'Remove selected manual values. Generated resources are refreshed by the next scan or Build; adapter values may then become effective.',
      inputSchema: z
        .object({
          config_file: ConfigFile,
          locale: Locale,
          keys: z.array(Key).min(1).max(500),
        })
        .strict(),
      annotations: writeAnnotations,
    },
    (input) =>
      callTool(() =>
        editRepositoryTranslations({
          config_file: input.config_file,
          locale: input.locale,
          updates: input.keys.map((key) => ({ key, value: null })),
        }),
      ),
  );
  return server;
}

async function callTool<T>(
  operation: () => Promise<T>,
): Promise<CallToolResult> {
  try {
    return {
      content: [{ type: 'text', text: JSON.stringify(await operation()) }],
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: 'text', text: JSON.stringify(errorPayload(error)) }],
    };
  }
}
