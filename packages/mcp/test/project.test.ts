import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import { createAiI18nMcpServer } from '../src/server';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test('lists missing files and effective translations with cursor pagination', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  const files = await service.listFiles({
    i18n_directory: directory,
    limit: 50,
  });
  expect(files.items).toEqual([
    {
      file: 'src/home.ts',
      message_count: 2,
      missing_count: 2,
      missing_by_locale: { 'en-US': 1, 'ja-JP': 1 },
    },
  ]);

  const first = await service.listTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    missing_only: true,
    limit: 1,
  });
  expect(first.items[0]).toMatchObject({
    message_id: '保存',
    translations: { 'en-US': null, 'ja-JP': '保存する' },
    missing_locales: ['en-US'],
  });
  expect(first.has_more).toBe(true);

  const second = await service.listTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    missing_only: true,
    limit: 1,
    cursor: first.next_cursor,
  });
  expect(second.items[0]?.message_id).toBe('退出');
});

test('fills null values atomically and refuses conflicting overwrites', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();
  const extractedPath = path.join(
    root,
    'apps/web/i18n/extracted/src/home.ts.json',
  );

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        { message_id: '退出', locale: 'en-US', value: 'Leave' },
      ],
    }),
  ).rejects.toThrow('refusing to overwrite');
  const unchanged = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<{ translations: Record<string, string | null> }>;
  };
  expect(unchanged.messages[0]?.translations['en-US']).toBeNull();

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        { message_id: '退出', locale: 'ja-JP', value: '' },
      ],
    }),
  ).resolves.toEqual({
    file: 'src/home.ts',
    applied_count: 2,
    unchanged_count: 0,
  });

  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<{
      id: string;
      translations: Record<string, string | null>;
    }>;
  };
  expect(extracted.messages[0]?.translations['en-US']).toBe('Save');
  expect(extracted.messages[1]?.translations['ja-JP']).toBe('');

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'ja-JP', value: 'セーブ' }],
    }),
  ).rejects.toThrow('refusing to overwrite');
});

test('requires an absolute directory and rejects unknown source files', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await expect(
    service.listFiles({ i18n_directory: 'apps/web/i18n', limit: 50 }),
  ).rejects.toThrow('must be an absolute path');
  await expect(
    service.listFiles({
      i18n_directory: path.join(root, 'missing-i18n'),
      limit: 50,
    }),
  ).rejects.toThrow('pass its final absolute path');
  await expect(
    service.listTranslations({
      i18n_directory: directory,
      file: 'src/missing.ts',
      missing_only: true,
      limit: 100,
    }),
  ).rejects.toThrow('extracted source not found');
});

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
  } finally {
    await clientTransport.close();
    await server.close();
  }
});

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-mcp-'));
  tempDirectories.push(root);
  const directory = path.join(root, 'apps/web/i18n');
  await fs.mkdir(path.join(directory, 'extracted/src'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'cache.json'),
    JSON.stringify({
      version: 1,
      files: {
        'src/home.ts': {
          fingerprint: 'sha256:test',
          messageIds: ['保存', '退出'],
        },
      },
      messages: {
        保存: {
          source: '保存',
          translations: { 'en-US': null, 'ja-JP': '保存する' },
        },
        退出: {
          source: '退出',
          translations: { 'en-US': 'Exit', 'ja-JP': null },
        },
      },
    }),
  );
  await fs.writeFile(
    path.join(directory, 'extracted/src/home.ts.json'),
    JSON.stringify({
      version: 1,
      source: 'src/home.ts',
      messages: [
        {
          id: '保存',
          source: '保存',
          locations: [{ line: 1, column: 0 }],
          translations: { 'en-US': null, 'ja-JP': null },
        },
        {
          id: '退出',
          source: '退出',
          locations: [{ line: 2, column: 0 }],
          translations: { 'en-US': null, 'ja-JP': null },
        },
      ],
    }),
  );
  return root;
}
