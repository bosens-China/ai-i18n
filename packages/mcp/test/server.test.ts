import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, expect, test } from 'vitest';
import { createAiI18nMcpServer } from '../src/server';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('registers six focused tools without legacy mode or output schemas', async () => {
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
      'ai_i18n_list_translations',
      'ai_i18n_set_translations',
      'ai_i18n_clear_translations',
      'ai_i18n_list_overrides',
      'ai_i18n_set_overrides',
      'ai_i18n_delete_overrides',
    ]);
    expect(tools.tools.every((tool) => tool.outputSchema === undefined)).toBe(
      true,
    );
    const setTranslations = tools.tools.find(
      (tool) => tool.name === 'ai_i18n_set_translations',
    );
    expect(setTranslations?.inputSchema).toMatchObject({
      properties: {
        overwrite_existing: { default: false, type: 'boolean' },
        updates: { maxItems: 500, minItems: 1, type: 'array' },
      },
    });
    const listTranslations = tools.tools.find(
      (tool) => tool.name === 'ai_i18n_list_translations',
    );
    expect(listTranslations?.inputSchema).toMatchObject({
      properties: {
        limit: { default: 100, maximum: 500, minimum: 1, type: 'integer' },
      },
    });
    expect(setTranslations?.inputSchema.properties).not.toHaveProperty('mode');
    expect(setTranslations?.inputSchema.properties).not.toHaveProperty(
      'review_scope',
    );
  } finally {
    await clientTransport.close();
    await server.close();
  }
});

test('returns one compact JSON TextContent and no structuredContent', async () => {
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
    const result = await client.callTool({
      name: 'ai_i18n_list_translations',
      arguments: {
        i18n_directory: path.join(root, 'apps/web/i18n'),
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result).not.toHaveProperty('structuredContent');
    expect(result.content).toHaveLength(1);
    const text = toolText(result.content);
    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toMatchObject({
      view: 'missing',
      total_file_count: 1,
      count: 2,
    });

    const error = await client.callTool({
      name: 'ai_i18n_list_translations',
      arguments: { i18n_directory: 'relative/i18n' },
    });
    expect(error.isError).toBe(true);
    expect(error).not.toHaveProperty('structuredContent');
    expect(JSON.parse(toolText(error.content))).toEqual({
      error_code: 'I18N_DIRECTORY_NOT_ABSOLUTE',
      i18n_directory: 'relative/i18n',
    });
  } finally {
    await clientTransport.close();
    await server.close();
  }
});

function toolText(content: unknown): string {
  if (
    !Array.isArray(content) ||
    content.length !== 1 ||
    typeof content[0] !== 'object' ||
    content[0] === null ||
    !('text' in content[0]) ||
    typeof content[0].text !== 'string'
  ) {
    throw new Error('Expected one TextContent result');
  }
  return content[0].text;
}
