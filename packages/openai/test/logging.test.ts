import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAI } from '../src/index';

const servers: Server[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('OpenAI response logging', () => {
  it('keeps repeated calls from one translator in one readable session log', async () => {
    const directory = await temporaryDirectory();
    const baseURL = await startServer();
    const translator = openAI({
      baseURL,
      apiKey: 'do-not-log-this-key',
      model: 'logging-model',
      maxRetries: 0,
    });

    await translator(loggedBatch('保存', directory));
    await translator(loggedBatch('取消', directory));

    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(
      /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-p\d+-\d+\.log$/,
    );
    const log = await readFile(join(directory, files[0]!), 'utf8');
    expect(log).toContain('ai-i18n OpenAI log session started');
    expect(log).toContain('model: logging-model');
    expect(log).toContain('REQUEST');
    expect(log).toContain('[SYSTEM]');
    expect(log).toContain('你是一名专业的软件界面翻译助手');
    expect(log).toContain('[USER]');
    expect(log).toContain('[RESPONSE METADATA]');
    expect(log).toContain('provider_extension');
    expect(log).toContain('[REASONING]');
    expect(log).toContain('完整思考内容');
    expect(log).toContain('[ASSISTANT]');
    expect(log).toContain('provider_message_field');
    expect(log).toContain('[USAGE]');
    expect(log).toContain('translation batch validated');
    expect(log.match(/translation batch validated/g)).toHaveLength(2);
    expect(log).not.toContain('do-not-log-this-key');
    expect(log).not.toContain('dangerouslyAllowBrowser');
    expect(log).not.toContain('__security');
    expect(log).not.toContain('x-stainless-');
    expect(log).not.toContain('temperature: undefined');
  });

  it('creates different files for different translator instances', async () => {
    const directory = await temporaryDirectory();
    const baseURL = await startServer();
    const options = {
      baseURL,
      model: 'logging-model',
      maxRetries: 0,
    } as const;

    await openAI(options)(loggedBatch('保存', directory));
    await openAI(options)(loggedBatch('取消', directory));

    expect(await readdir(directory)).toHaveLength(2);
  });

  it('keeps concurrent SDK and validation logs on their own batch IDs', async () => {
    const directory = await temporaryDirectory();
    const baseURL = await startServer();
    const translator = openAI({
      baseURL,
      model: 'logging-model',
      maxRetries: 0,
    });

    await Promise.all([
      translator({
        ...loggedBatch('保存', directory),
        batchId: 'batch-concurrent-a',
      }),
      translator({
        ...loggedBatch('取消', directory),
        batchId: 'batch-concurrent-b',
      }),
    ]);

    const [file] = await readdir(directory);
    const log = await readFile(join(directory, file!), 'utf8');
    expect(log.match(/batchId: batch-concurrent-a/g)).toHaveLength(3);
    expect(log.match(/batchId: batch-concurrent-b/g)).toHaveLength(3);
  });

  it('appends Vite lifecycle events to the same log session', async () => {
    const directory = await temporaryDirectory();
    const baseURL = await startServer();
    const translator = openAI({
      baseURL,
      model: 'logging-model',
      maxRetries: 0,
    });
    const batchId = 'batch-lifecycle';

    await translator.reportBatchEvent?.({
      batchId,
      stage: 'scheduled',
      logging: directory,
      locales: ['en-US'],
      messageCount: 1,
    });
    await translator({ ...loggedBatch('保存', directory), batchId });
    await translator.reportBatchEvent?.({
      batchId,
      stage: 'state-applied',
      logging: directory,
      resultCount: 1,
      affectedModules: 1,
    });
    await translator.reportBatchEvent?.({
      batchId,
      stage: 'persisted',
      logging: directory,
    });

    const [file] = await readdir(directory);
    const log = await readFile(join(directory, file!), 'utf8');
    expect(log).toContain('BATCH SCHEDULED');
    expect(log).toContain('STATE APPLIED');
    expect(log).toContain('PERSISTED');
    expect(log.match(/batchId: batch-lifecycle/g)).toHaveLength(6);
  });

  it('does not create the default log directory for a direct call', async () => {
    const parent = await temporaryDirectory();
    const baseURL = await startServer();
    const previousDirectory = process.cwd();

    try {
      process.chdir(parent);
      await openAI({
        baseURL,
        model: 'logging-model',
        maxRetries: 0,
      })(batch('保存'));
    } finally {
      process.chdir(previousDirectory);
    }

    await expect(readdir(join(parent, 'logs'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('writes to the resolved directory supplied by a Vite batch', async () => {
    const parent = await temporaryDirectory();
    const directory = join(parent, 'logs');
    const baseURL = await startServer();
    await openAI({
      baseURL,
      model: 'logging-model',
      maxRetries: 0,
    })({
      ...loggedBatch('保存', directory),
      batchId: 'batch-enabled',
    });

    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    expect(await readFile(join(directory, files[0]!), 'utf8')).toContain(
      'batchId: batch-enabled',
    );
  });

  it('honors a disabled Vite batch without writing to the session log', async () => {
    const directory = await temporaryDirectory();
    const baseURL = await startServer();
    const translator = openAI({
      baseURL,
      model: 'logging-model',
      maxRetries: 0,
    });

    await expect(
      translator({ ...batch('保存'), batchId: 'batch-muted', logging: false }),
    ).resolves.toEqual([{ 'en-US': 'Save' }]);
    expect(await readdir(directory)).toEqual([]);
  });

  it('warns once and keeps translating when the log path is not writable', async () => {
    const directory = await temporaryDirectory();
    const invalidDirectory = join(directory, 'not-a-directory');
    await writeFile(invalidDirectory, 'occupied', 'utf8');
    const baseURL = await startServer();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const translator = openAI({
      baseURL,
      model: 'logging-model',
      maxRetries: 0,
    });

    await expect(
      translator(loggedBatch('保存', invalidDirectory)),
    ).resolves.toEqual([{ 'en-US': 'Save' }]);
    await expect(
      translator(loggedBatch('取消', invalidDirectory)),
    ).resolves.toEqual([{ 'en-US': 'Save' }]);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain('[ai-i18n/openai]');
  });
});

function batch(source: string) {
  return { locales: ['en-US'], messages: [{ source }] };
}

function loggedBatch(source: string, directory: string) {
  return { ...batch(source), logging: directory };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'ai-i18n-openai-log-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function startServer(): Promise<string> {
  const server = createServer(async (request, response) => {
    for await (const chunk of request) {
      // 完整读取请求后再返回，避免客户端复用连接时出现竞态。
      void chunk;
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        id: 'chatcmpl-log-test',
        object: 'chat.completion',
        created: 0,
        model: 'logging-model',
        provider_extension: { trace: 'preserved' },
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: JSON.stringify({
                translations: [{ 'en-US': 'Save' }],
              }),
              reasoning_content: '完整思考内容',
              refusal: null,
              tool_calls: [],
              provider_message_field: { preserved: true },
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          completion_tokens_details: { reasoning_tokens: 3 },
        },
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
