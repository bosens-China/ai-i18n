import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { sqlite } from '@ai-i18n/sqlite';
import { afterEach, expect, test } from 'vitest';
import { createAiI18nMcpServer } from '../src/server';
import { cleanupFixtures, fixture } from './project-fixture';

const externalDirectories: string[] = [];

afterEach(async () => {
  await cleanupFixtures();
  await Promise.all(
    externalDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test('offers optional SQLite values without changing project translations', async () => {
  const root = await fixture();
  const app = path.join(root, 'apps/web');
  const directory = path.join(app, 'i18n');
  const dataDirectory = path.join(root, 'user-data');
  const packageDirectory = path.join(app, 'node_modules/@ai-i18n');
  await fs.mkdir(packageDirectory, { recursive: true });
  await fs.symlink(
    path.resolve('packages/sqlite'),
    path.join(packageDirectory, 'sqlite'),
    'dir',
  );
  const cache = await sqlite({ dataDirectory }).open(directory);
  await cache.sync([
    {
      source: '保存',
      sourceLang: 'zh-CN',
      targetLang: 'en-US',
      value: 'Save',
    },
  ]);
  cache.close();

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
      name: 'ai_i18n_list_cache_candidates',
      arguments: {
        i18n_directory: directory,
        message: { source: '保存' },
        locale: 'en-US',
        data_directory: dataDirectory,
      },
    });
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(toolText(result.content))).toEqual({
      message: { source: '保存' },
      locale: 'en-US',
      current_automatic_value: null,
      candidates: [
        {
          value: 'Save',
          sources: [
            { project: await fs.realpath(directory), kind: 'automatic' },
          ],
          sources_has_more: false,
        },
      ],
      next_offset: null,
      automatic_value: 'Save',
      has_more: false,
    });
    const managementArguments = {
      i18n_directory: directory,
      data_directory: dataDirectory,
    };
    const projects = await client.callTool({
      name: 'ai_i18n_list_cache_projects',
      arguments: managementArguments,
    });
    expect(JSON.parse(toolText(projects.content)).projects[0].project).toBe(
      await fs.realpath(directory),
    );
    const preview = await client.callTool({
      name: 'ai_i18n_clean_cache',
      arguments: {
        ...managementArguments,
        scope: 'project',
        project_directory: await fs.realpath(directory),
      },
    });
    const cleanup = JSON.parse(toolText(preview.content));
    expect(cleanup).toMatchObject({ records: 1, executed: false });
    const executed = await client.callTool({
      name: 'ai_i18n_clean_cache',
      arguments: {
        ...managementArguments,
        scope: 'project',
        project_directory: await fs.realpath(directory),
        preview_token: cleanup.token,
      },
    });
    expect(JSON.parse(toolText(executed.content))).toMatchObject({
      records: 1,
      executed: true,
    });
    const listed = await client.callTool({
      name: 'ai_i18n_list_translations',
      arguments: { i18n_directory: directory, view: 'all' },
    });
    expect(
      JSON.parse(toolText(listed.content)).items[0].translations['en-US'],
    ).toBeNull();
  } finally {
    await clientTransport.close();
    await server.close();
  }
});

test('resolves SQLite from the app when i18n_directory is outside it', async () => {
  const root = await fixture();
  const app = path.join(root, 'apps/web');
  const external = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-mcp-sql-'));
  externalDirectories.push(external);
  const directory = path.join(external, 'i18n');
  const dataDirectory = path.join(root, 'user-data');
  await fs.cp(path.join(app, 'i18n'), directory, { recursive: true });
  const packageDirectory = path.join(app, 'node_modules/@ai-i18n');
  await fs.mkdir(packageDirectory, { recursive: true });
  await fs.symlink(
    path.resolve('packages/sqlite'),
    path.join(packageDirectory, 'sqlite'),
    'dir',
  );
  const cache = await sqlite({ dataDirectory }).open(directory);
  await cache.sync([
    { source: '保存', sourceLang: 'zh-CN', targetLang: 'en-US', value: 'Save' },
  ]);
  cache.close();

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
      name: 'ai_i18n_list_cache_candidates',
      arguments: {
        i18n_directory: directory,
        app_directory: app,
        data_directory: dataDirectory,
        message: { source: '保存' },
        locale: 'en-US',
      },
    });
    expect(result.isError).not.toBe(true);
    expect(
      JSON.parse(toolText(result.content)).candidates.map(
        (item: { value: string }) => item.value,
      ),
    ).toEqual(['Save']);
  } finally {
    await clientTransport.close();
    await server.close();
  }
});

function toolText(content: unknown): string {
  if (!Array.isArray(content) || content[0]?.type !== 'text')
    throw new Error('Expected one text content');
  return content[0].text as string;
}
