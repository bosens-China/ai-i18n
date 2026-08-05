import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, expect, test } from 'vitest';
import { createAiI18nMcpServer } from '../src/server';
import {
  addFixtureOrphanMessage,
  cleanupFixtures,
  fixture,
} from './project-fixture';

afterEach(cleanupFixtures);

test('registers eight focused tools without legacy mode or output schemas', async () => {
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
      'ai_i18n_list_orphan_messages',
      'ai_i18n_delete_orphan_messages',
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
        updates: {
          items: { additionalProperties: false },
          maxItems: 500,
          minItems: 1,
          type: 'array',
        },
      },
    });
    const listTranslations = tools.tools.find(
      (tool) => tool.name === 'ai_i18n_list_translations',
    );
    expect(listTranslations?.inputSchema).toMatchObject({
      properties: {
        include_source_files: { default: false, type: 'boolean' },
        limit: { default: 100, maximum: 500, minimum: 1, type: 'integer' },
      },
    });
    expect(setTranslations?.inputSchema.properties).not.toHaveProperty('mode');
    expect(setTranslations?.inputSchema.properties).not.toHaveProperty(
      'review_scope',
    );
    const listOrphans = tools.tools.find(
      (tool) => tool.name === 'ai_i18n_list_orphan_messages',
    );
    const deleteOrphans = tools.tools.find(
      (tool) => tool.name === 'ai_i18n_delete_orphan_messages',
    );
    expect(listOrphans?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
    });
    expect(deleteOrphans?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    });
    expect(deleteOrphans?.inputSchema).toMatchObject({
      properties: {
        orphan_ids: {
          maxItems: 500,
          minItems: 1,
          type: 'array',
        },
      },
    });
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
    expect(JSON.parse(text).items[0]).not.toHaveProperty('source_files');

    const withSourceFiles = await client.callTool({
      name: 'ai_i18n_list_translations',
      arguments: {
        i18n_directory: path.join(root, 'apps/web/i18n'),
        include_source_files: true,
      },
    });
    expect(
      JSON.parse(toolText(withSourceFiles.content)).items[0],
    ).toHaveProperty('source_files');

    await addFixtureOrphanMessage(path.join(root, 'apps/web/i18n'), {
      id: '旧文案',
      source: '旧文案',
    });
    const orphans = await client.callTool({
      name: 'ai_i18n_list_orphan_messages',
      arguments: {
        i18n_directory: path.join(root, 'apps/web/i18n'),
      },
    });
    expect(JSON.parse(toolText(orphans.content))).toMatchObject({
      total_count: 1,
      items: [
        {
          orphan_id: expect.stringMatching(/^[a-f0-9]{64}$/),
          message: { source: '旧文案' },
        },
      ],
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
      next_action:
        'Resolve the target Vite root and aiI18n.directory, then retry with the resulting absolute i18n_directory.',
    });

    const invalidOrphan = await client.callTool({
      name: 'ai_i18n_delete_orphan_messages',
      arguments: {
        i18n_directory: path.join(root, 'apps/web/i18n'),
        orphan_ids: ['invalid'],
      },
    });
    expect(invalidOrphan.isError).toBe(true);
    expect(JSON.parse(toolText(invalidOrphan.content))).toMatchObject({
      error_code: 'INVALID_ORPHAN_ID',
      next_action: expect.stringContaining('list_orphan_messages'),
    });
  } finally {
    await clientTransport.close();
    await server.close();
  }
});

test('groups repeated unknown batch fields into one actionable error', async () => {
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
      name: 'ai_i18n_set_translations',
      arguments: {
        i18n_directory: '/tmp/i18n',
        updates: Array.from({ length: 100 }, () => ({
          message: { source: '保存' },
          locale: 'en-US',
          value: 'Save',
          scope: 'default',
        })),
      },
    });
    const text = toolText(result.content);
    expect(result.isError).toBe(true);
    expect(text.match(/Unrecognized key "scope"/g)).toHaveLength(1);
    expect(text).toContain('100 occurrences; first at updates[0]');
    expect(text).toContain('Valid keys: message, locale, value');
    expect(text).toContain(
      'Next action: remove "scope" from every updates item and retry.',
    );
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
