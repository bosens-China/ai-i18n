import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { expect, test } from 'vitest';
import { createAiI18nMcpServer } from '../src/server.js';

test('exposes only the repository translation workflow', async () => {
  const server = createAiI18nMcpServer();
  const client = new Client({ name: 'test', version: '1' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'ai_i18n_discover_projects',
      'ai_i18n_resolve_project',
      'ai_i18n_scan_project',
      'ai_i18n_list_translations',
      'ai_i18n_set_translations',
      'ai_i18n_clear_translations',
    ]);
    const result = await client.callTool({
      name: 'ai_i18n_list_translations',
      arguments: { config_file: 'missing.config.ts', locale: 'en-US' },
    });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    expect(result).not.toHaveProperty('structuredContent');
  } finally {
    await client.close();
    await server.close();
  }
});
