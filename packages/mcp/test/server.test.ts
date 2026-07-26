import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, expect, test } from 'vitest';
import { createAiI18nMcpServer } from '../src/server';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('registers callable MCP tools with defaults and structured output', async () => {
  const root = await fixture();
  const server = createAiI18nMcpServer();
  const client = new Client({ name: 'ai-i18n-mcp-test', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  try {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'ai_i18n_list_translation_files',
      'ai_i18n_list_translations',
      'ai_i18n_write_translations',
    ]);
    expect(
      tools.tools.find((tool) => tool.name === 'ai_i18n_write_translations')
        ?.inputSchema,
    ).toMatchObject({
      properties: {
        mode: { default: 'fill', enum: ['fill', 'review'] },
        review_scope: {
          default: 'default',
          enum: ['default', 'message'],
        },
      },
    });
    const result = await client.callTool({
      name: 'ai_i18n_list_translations',
      arguments: {
        i18n_directory: path.join(root, 'apps/web/i18n'),
        file: 'src/home.ts',
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      total_count: 2,
      count: 2,
    });
    expect(result.content).toEqual([
      {
        type: 'text',
        text: expect.stringContaining('"message_id": "保存"'),
      },
    ]);
  } finally {
    await clientTransport.close();
    await server.close();
  }
});
