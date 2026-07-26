import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import { filterTranslations } from '../src/project-files';
import { paginate } from '../src/pagination';
import { createAiI18nMcpServer } from '../src/server';

const tempDirectories: string[] = [];

test('treats a missing scoped locale as an untranslated value', () => {
  expect(filterTranslations({ 'en-US': null }, 'ja-JP')).toEqual({
    'ja-JP': null,
  });
});

test('enforces response size and rejects invalid cursors', () => {
  const items = [{ id: '示例' }, { id: '请输入' }, { id: '首页' }];
  const first = paginate(items, (item) => item.id, 3, undefined, 1);

  expect(first).toMatchObject({
    items: [{ id: '示例' }],
    has_more: true,
    truncated_by_size: true,
  });
  expect(
    paginate(items, (item) => item.id, 3, first.next_cursor).items,
  ).toEqual([{ id: '请输入' }, { id: '首页' }]);
  expect(() => paginate(items, (item) => item.id, 3, 'invalid')).toThrow(
    'invalid cursor',
  );
});

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
    messages: Array<Record<string, unknown>>;
  };
  expect(unchanged.messages[0]).not.toHaveProperty('translations');

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

  const memory = JSON.parse(
    await fs.readFile(path.join(directory, 'translations.json'), 'utf8'),
  ) as {
    revision: number;
    messages: Record<string, { translations: Record<string, string | null> }>;
  };
  expect(memory.revision).toBe(1);
  expect(memory.messages['保存']?.translations['en-US']).toBe('Save');
  expect(memory.messages['退出']?.translations['ja-JP']).toBe('');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  expect(extracted.messages[0]).not.toHaveProperty('translations');

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
    applied_count: 0,
    unchanged_count: 2,
  });

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'ja-JP', value: 'セーブ' }],
    }),
  ).rejects.toThrow('refusing to overwrite');
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'fr-FR', value: 'Sauvegarder' },
      ],
    }),
  ).rejects.toThrow('unknown locale "fr-FR"');
});

test('reports a missing message id and points to the list tool', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  await expect(
    new AiI18nProjectService().writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '不存在', locale: 'en-US', value: 'Missing' },
      ],
    }),
  ).rejects.toThrowError(
    new Error(
      '[ai-i18n/mcp] message "不存在" does not exist in "src/home.ts"; call ai_i18n_list_translations for this file and use the returned message_id',
    ),
  );
});

test('writes human review to overrides without replacing AI memory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    translations: [{ message_id: '保存', locale: 'en-US', value: 'Save' }],
  });
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
    }),
  ).rejects.toThrow('refusing to overwrite');
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
    }),
  ).resolves.toMatchObject({ applied_count: 1 });

  const memory = JSON.parse(
    await fs.readFile(path.join(directory, 'translations.json'), 'utf8'),
  );
  expect(memory.messages['保存'].translations['en-US']).toBe('Save');
  const overrides = JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  );
  expect(overrides.messages['保存'].default['en-US']).toBe('Keep');
});

test('resolves default and explicit-id reviews before AI memory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: 'toolbar.save',
    source: '保存',
    locations: [{ line: 3, column: 0 }],
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));
  const memoryPath = path.join(directory, 'translations.json');
  const memory = JSON.parse(await fs.readFile(memoryPath, 'utf8'));
  memory.messages['toolbar.save'] = {
    sourceLang: 'zh-CN',
    translations: { 'en-US': null, 'ja-JP': null },
  };
  await fs.writeFile(memoryPath, JSON.stringify(memory));
  const service = new AiI18nProjectService();

  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    translations: [
      { message_id: 'toolbar.save', locale: 'en-US', value: 'Save action' },
    ],
  });
  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    mode: 'review',
    translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
  });
  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    mode: 'review',
    review_scope: 'message',
    translations: [{ message_id: 'toolbar.save', locale: 'en-US', value: '' }],
  });

  const listed = await service.listTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    missing_only: false,
    limit: 100,
  });
  expect(
    listed.items.find((message) => message.message_id === '保存')?.translations[
      'en-US'
    ],
  ).toBe('Keep');
  const scoped = listed.items.find(
    (message) => message.message_id === 'toolbar.save',
  );
  expect(scoped).toMatchObject({
    source: '保存',
    translations: { 'en-US': '' },
  });
  expect(scoped?.missing_locales).not.toContain('en-US');

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: 'toolbar.save', locale: 'en-US', value: 'Save' },
      ],
    }),
  ).rejects.toThrow('refusing to overwrite');
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      review_scope: 'message',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Save' }],
    }),
  ).rejects.toThrow('requires an explicit message id');

  const overrides = JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  );
  expect(overrides.messages['保存']).toMatchObject({
    default: { 'en-US': 'Keep' },
    byId: { 'toolbar.save': { 'en-US': '' } },
  });
  expect(
    JSON.parse(await fs.readFile(memoryPath, 'utf8')).messages['toolbar.save']
      .translations['en-US'],
  ).toBe('Save action');
});

test('rejects one message id assigned to different source text', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: '保存',
    source: '提交',
    locations: [{ line: 3, column: 0 }],
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));

  await expect(
    new AiI18nProjectService().listTranslations({
      i18n_directory: directory,
      missing_only: false,
      limit: 100,
    }),
  ).rejects.toThrow('message ID "保存" refers to both "保存" and "提交"');
});

test('preserves template tokens before writing a translation batch', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const memoryPath = path.join(directory, 'translations.json');
  const messageId = '语法 {{=0}}，当前 {{0}}';
  const memory = JSON.parse(await fs.readFile(memoryPath, 'utf8')) as {
    messages: Record<string, unknown>;
  };
  memory.messages[messageId] = {
    sourceLang: 'zh-CN',
    translations: { 'en-US': null, 'ja-JP': null },
  };
  await fs.writeFile(memoryPath, JSON.stringify(memory));
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: messageId,
    source: messageId,
    locations: [{ line: 3, column: 0 }],
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
    JSON.parse(await fs.readFile(memoryPath, 'utf8')).messages['保存']
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

test('serializes concurrent translation-memory updates from separate services', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const first = new AiI18nProjectService();
  const second = new AiI18nProjectService();

  await Promise.all([
    first.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Save' }],
    }),
    second.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '退出', locale: 'ja-JP', value: '' }],
    }),
  ]);

  const memory = JSON.parse(
    await fs.readFile(path.join(directory, 'translations.json'), 'utf8'),
  ) as {
    messages: Record<string, { translations: Record<string, string | null> }>;
  };
  expect(memory.messages['保存']?.translations['en-US']).toBe('Save');
  expect(memory.messages['退出']?.translations['ja-JP']).toBe('');
});

test('serializes concurrent human reviews from separate services', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const first = new AiI18nProjectService();
  const second = new AiI18nProjectService();

  await Promise.all([
    first.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
    }),
    second.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      translations: [{ message_id: '退出', locale: 'ja-JP', value: '' }],
    }),
  ]);

  const overrides = JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  );
  expect(overrides.messages['保存']?.default['en-US']).toBe('Keep');
  expect(overrides.messages['退出']?.default['ja-JP']).toBe('');
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

test('requires both translation input files', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await fs.rm(path.join(directory, 'overrides.json'));

  await expect(
    new AiI18nProjectService().listFiles({
      i18n_directory: directory,
      limit: 50,
    }),
  ).rejects.toThrow('required ai-i18n file is missing: overrides.json');
});

test('requires the extracted protocol directory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  await fs.rm(path.join(directory, 'extracted'), { recursive: true });

  await expect(
    new AiI18nProjectService().listFiles({
      i18n_directory: directory,
      limit: 50,
    }),
  ).rejects.toThrow('required ai-i18n directory is missing: extracted');
});

test('ignores nested extracted directories outside the current protocol', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const nested = path.join(directory, 'extracted/legacy');
  await fs.mkdir(nested);
  await fs.writeFile(path.join(nested, 'obsolete.json'), 'invalid');

  await expect(
    new AiI18nProjectService().listFiles({
      i18n_directory: directory,
      limit: 50,
    }),
  ).resolves.toMatchObject({
    items: [{ file: 'src/home.ts' }],
  });
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

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-mcp-'));
  tempDirectories.push(root);
  const directory = path.join(root, 'apps/web/i18n');
  await fs.mkdir(path.join(directory, 'extracted'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'translations.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
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
    path.join(directory, 'overrides.json'),
    JSON.stringify({ version: 1, messages: {} }),
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
        },
        {
          id: '退出',
          source: '退出',
          locations: [{ line: 2, column: 0 }],
        },
      ],
    }),
  );
  return root;
}
