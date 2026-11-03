import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { discoverProjects, resolveProject } from './project-discovery.js';

export function registerDiscoveryTools(
  server: McpServer,
  call: <T>(operation: () => Promise<T>) => Promise<CallToolResult>,
) {
  server.registerTool(
    'ai_i18n_discover_projects',
    {
      title: 'Discover ai-i18n projects',
      description:
        'Find ai-i18n.config.ts files under an explicit workspace without executing configs. Multiple results are separate apps; select one before resolving. If truncated, narrow the workspace directory.',
      inputSchema: z
        .object({ workspace_directory: z.string().min(1).max(4096) })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    (input) => call(() => discoverProjects(input.workspace_directory)),
  );
  server.registerTool(
    'ai_i18n_resolve_project',
    {
      title: 'Resolve selected ai-i18n config',
      description:
        'Execute only the selected ai-i18n config to resolve its app and translation directories. Does not load vite.config, scan source, or call the translator. Pass the same command and mode as the intended build/scan. Config code and imports execute; resolve only the selected trusted project.',
      inputSchema: z
        .object({
          config_file: z.string().min(1).max(4096),
          command: z.enum(['serve', 'build']).default('serve'),
          mode: z.string().min(1).max(128).optional(),
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    (input) =>
      call(() => resolveProject(input.config_file, input.command, input.mode)),
  );
}
