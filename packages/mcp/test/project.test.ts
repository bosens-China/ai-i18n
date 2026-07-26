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
    'apps/web/i18n/extracted/src_home.ts.json',
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

test('preserves template tokens before writing a translation batch', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const cachePath = path.join(directory, 'cache.json');
  const messageId = '语法 {{=0}}，当前 {{0}}';
  const cache = JSON.parse(await fs.readFile(cachePath, 'utf8')) as {
    messages: Record<string, unknown>;
  };
  cache.messages[messageId] = {
    sourceLang: 'zh-CN',
    translations: { 'en-US': null, 'ja-JP': null },
  };
  await fs.writeFile(cachePath, JSON.stringify(cache));
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: messageId,
    source: messageId,
    locations: [{ line: 3, column: 0 }],
    translations: { 'en-US': null, 'ja-JP': null },
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));
  const service = new AiI18nProjectService();

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        {
          message_id: messageId,
          locale: 'en-US',
          value: 'Syntax {{0}}; current {{0}}',
        },
      ],
    }),
  ).rejects.toThrow('changed template tokens');
  expect(
    JSON.parse(await fs.readFile(extractedPath, 'utf8')).messages[0]
      .translations['en-US'],
  ).toBeNull();

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        {
          message_id: messageId,
          locale: 'en-US',
          value: 'Current {{0}}; syntax {{=0}}',
        },
      ],
    }),
  ).resolves.toMatchObject({ applied_count: 1 });
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
  await fs.mkdir(path.join(root, 'invalid/i18n/extracted'), {
    recursive: true,
  });
  await fs.writeFile(path.join(root, 'invalid/i18n/cache.json'), '{}');
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
      'ai_i18n_discover',
      'ai_i18n_list_translation_files',
      'ai_i18n_list_translations',
      'ai_i18n_write_translations',
    ]);
    const discovered = await client.callTool({
      name: 'ai_i18n_discover',
      arguments: { cwd: root },
    });
    expect(discovered.structuredContent).toMatchObject({
      count: 1,
      items: [{ i18n_directory: path.join(root, 'apps/web/i18n') }],
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

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-mcp-'));
  tempDirectories.push(root);
  const directory = path.join(root, 'apps/web/i18n');
  await fs.mkdir(path.join(directory, 'extracted'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'cache.json'),
    JSON.stringify({
      version: 2,
      messages: {
        保存: {
          sourceLang: 'zh-CN',
          translations: { 'en-US': null, 'ja-JP': '保存する' },
        },
        退出: {
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Exit', 'ja-JP': null },
        },
      },
    }),
  );
  await fs.writeFile(
    path.join(directory, 'extracted/src_home.ts.json'),
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
