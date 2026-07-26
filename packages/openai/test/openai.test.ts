import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAI } from '../src/index';

const servers: Server[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe('openAI', () => {
  it('sends a structured batch with user configuration and the required suffix', async () => {
    let captured: CapturedRequest | undefined;
    let requestCount = 0;
    const baseURL = await startServer(async (request, body) => {
      requestCount += 1;
      captured = { request, body };
      return completion(validPayload());
    });
    const translator = openAI({
      baseURL: `${baseURL}/v1/`,
      model: 'chosen-model',
      systemPrompt: 'Translate product interface messages.',
      apiKey: 'secret-key',
      temperature: 0.25,
      maxTokens: 1_024,
      timeoutMs: 5_000,
      maxRetries: 0,
      headers: { 'x-provider-version': '2026-07-22' },
    });

    const results = await translator(translationRequests());

    expect(results).toEqual(validResults());
    expect(requestCount).toBe(1);
    expect(captured?.request.url).toBe('/v1/chat/completions');
    expect(captured?.request.headers.authorization).toBe('Bearer secret-key');
    expect(captured?.request.headers['x-provider-version']).toBe('2026-07-22');
    expect(captured?.body).toMatchObject({
      model: 'chosen-model',
      temperature: 0.25,
      max_tokens: 1_024,
      messages: [{ role: 'system' }, { role: 'user' }],
      response_format: { type: 'json_object' },
    });
    const messages = captured?.body.messages as Array<{ content: string }>;
    expect(messages[0]!.content).toMatch(
      /^Translate product interface messages\.\n\n`\{\{0\}\}`/,
    );
    expect(messages[0]!.content).toContain('`{{=0}}`');
    expect(messages[0]!.content).toContain('与输入下标一一对应');
    expect(messages[0]!.content).toContain(
      '{"translations":[{"en-US":"","ja-JP":""}]}',
    );
    expect(JSON.parse(messages[1]!.content)).toEqual([
      { source: '查询' },
      { source: '查询', comment: '按钮' },
    ]);
  });

  it('groups messages by the same missing locale set', async () => {
    const inputs: Array<Array<{ source: string }>> = [];
    const baseURL = await startServer(async (_request, body) => {
      const messages = body.messages as Array<{ content: string }>;
      const input = JSON.parse(messages[1]!.content) as Array<{
        source: string;
      }>;
      inputs.push(input);
      return completion(
        input.length === 3
          ? {
              translations: input.map(({ source }) => ({
                'ja-JP': `ja:${source}`,
              })),
            }
          : {
              translations: input.map(({ source }) => ({
                'en-US': `en:${source}`,
                'ja-JP': `ja:${source}`,
              })),
            },
      );
    });
    const requests = [
      { messageId: '1', source: '1', locale: 'ja-JP' },
      { messageId: '2', source: '2', locale: 'ja-JP' },
      { messageId: '3', source: '3', locale: 'ja-JP' },
      { messageId: '4', source: '4', locale: 'en-US' },
      { messageId: '4', source: '4', locale: 'ja-JP' },
      { messageId: '5', source: '5', locale: 'en-US' },
      { messageId: '5', source: '5', locale: 'ja-JP' },
    ];

    await expect(openAI(validOptions(baseURL))(requests)).resolves.toEqual([
      { messageId: '1', locale: 'ja-JP', value: 'ja:1' },
      { messageId: '2', locale: 'ja-JP', value: 'ja:2' },
      { messageId: '3', locale: 'ja-JP', value: 'ja:3' },
      { messageId: '4', locale: 'en-US', value: 'en:4' },
      { messageId: '4', locale: 'ja-JP', value: 'ja:4' },
      { messageId: '5', locale: 'en-US', value: 'en:5' },
      { messageId: '5', locale: 'ja-JP', value: 'ja:5' },
    ]);
    expect(inputs).toEqual([
      [{ source: '1' }, { source: '2' }, { source: '3' }],
      [{ source: '4' }, { source: '5' }],
    ]);
  });

  it('keeps hashes in source text separate from comments', async () => {
    let input: unknown;
    const baseURL = await startServer(async (_request, body) => {
      const messages = body.messages as Array<{ content: string }>;
      input = JSON.parse(messages[1]!.content);
      return completion({
        translations: [{ 'en-US': 'Issue #123' }, { 'en-US': 'C# button' }],
      });
    });

    await openAI(validOptions(baseURL))([
      { messageId: 'issue', source: 'Issue #123', locale: 'en-US' },
      {
        messageId: 'button',
        source: 'C#',
        comment: 'button # label',
        locale: 'en-US',
      },
    ]);

    expect(input).toEqual([
      { source: 'Issue #123' },
      { source: 'C#', comment: 'button # label' },
    ]);
  });

  it('uses safe defaults and does not leak an environment key to a local endpoint', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'must-not-leak');
    let captured: CapturedRequest | undefined;
    const baseURL = await startServer(async (request, body) => {
      captured = { request, body };
      return completion({
        translations: [{ 'en-US': 'Save' }],
      });
    });

    await openAI({ baseURL, model: 'local-model' })([
      { messageId: 'save', source: '保存', locale: 'en-US' },
    ]);

    expect(captured?.request.headers.authorization).toBe(
      'Bearer local-no-auth',
    );
    expect(captured?.body.temperature).toBe(1);
    expect(
      (captured?.body.messages as Array<{ content: string }>)[0]!.content,
    ).toContain('你是一名专业的软件界面翻译助手');
  });

  it('applies the configured request timeout', async () => {
    const baseURL = await startServer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return completion({
        translations: [{ 'en-US': 'Save' }],
      });
    });

    await expect(
      openAI({
        baseURL,
        model: 'timeout-model',
        timeoutMs: 10,
        maxRetries: 0,
      })([{ messageId: 'save', source: '保存', locale: 'en-US' }]),
    ).rejects.toThrow('[ai-i18n/openai] translation request failed');
  });

  it('rejects missing, extra, and malformed result rows', async () => {
    const invalidPayloads = [
      { translations: [] },
      {
        translations: [{ 'en-US': 'Save' }, { 'en-US': 'Again' }],
      },
      { translations: [{}] },
      { translations: [{ 'en-US': 'Save', 'ja-JP': '保存' }] },
      { translations: [{ 'en-US': 1 }] },
    ];

    for (const payload of invalidPayloads) {
      const baseURL = await startServer(async () => completion(payload));
      const translator = openAI(validOptions(baseURL));
      await expect(
        translator([{ messageId: 'save', source: '保存', locale: 'en-US' }]),
      ).rejects.toThrow('[ai-i18n/openai] invalid translation result');
    }
  });

  it('rejects translations that change tagged-template placeholders', async () => {
    const baseURL = await startServer(async () =>
      completion({
        translations: [{ 'en-US': 'Hello' }],
      }),
    );

    await expect(
      openAI(validOptions(baseURL))([
        {
          messageId: 'welcome',
          source: '你好 {{0}}',
          locale: 'en-US',
        },
      ]),
    ).rejects.toThrow('changed template placeholders');
  });

  it('preserves escaped literal tokens separately from runtime values', async () => {
    const validURL = await startServer(async () =>
      completion({
        translations: [
          {
            'en-US': 'Current: {{0}}; syntax: {{=0}}',
          },
        ],
      }),
    );
    await expect(
      openAI(validOptions(validURL))([
        {
          messageId: 'example',
          source: '语法：{{=0}}；当前：{{0}}',
          locale: 'en-US',
        },
      ]),
    ).resolves.toHaveLength(1);

    const invalidURL = await startServer(async () =>
      completion({
        translations: [
          {
            'en-US': 'Syntax: {{0}}; current: {{0}}',
          },
        ],
      }),
    );
    await expect(
      openAI(validOptions(invalidURL))([
        {
          messageId: 'example',
          source: '语法：{{=0}}；当前：{{0}}',
          locale: 'en-US',
        },
      ]),
    ).rejects.toThrow('changed template placeholders');
  });

  it('does not request the service for an empty batch', async () => {
    let requested = false;
    const baseURL = await startServer(async () => {
      requested = true;
      return completion({ translations: [] });
    });

    await expect(openAI(validOptions(baseURL))([])).resolves.toEqual([]);
    expect(requested).toBe(false);
  });

  it('reports HTTP and response shape failures without exposing response data', async () => {
    const errorURL = await startServer(async () => ({
      status: 401,
      body: { error: 'secret provider details' },
    }));
    const invalidURL = await startServer(async () => ({
      body: { choices: [] },
    }));

    const error = await openAI(validOptions(errorURL))([
      { messageId: 'save', source: '保存', locale: 'en-US' },
    ]).catch((cause: unknown) => cause);
    expect(error).toEqual(
      new Error('[ai-i18n/openai] request failed with status 401'),
    );
    await expect(
      openAI(validOptions(invalidURL))([
        { messageId: 'save', source: '保存', locale: 'en-US' },
      ]),
    ).rejects.toThrow('[ai-i18n/openai] translation request failed');
  });

  it('validates required and bounded configuration', () => {
    expect(() => openAI({ ...validOptions(), baseURL: ' ' })).toThrow(
      'baseURL is required',
    );
    expect(() => openAI({ ...validOptions(), model: ' ' })).toThrow(
      'model is required',
    );
    expect(() => openAI({ ...validOptions(), systemPrompt: ' ' })).toThrow(
      'systemPrompt is required',
    );
    expect(() => openAI({ ...validOptions(), maxRetries: -1 })).toThrow(
      'maxRetries must be a non-negative integer',
    );
    expect(() =>
      openAI({
        ...validOptions(),
        langSmith: { apiKey: ' ' },
      }),
    ).toThrow('langSmith.apiKey is required');
  });
});

interface CapturedRequest {
  request: IncomingMessage;
  body: Record<string, unknown>;
}

interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

function validOptions(baseURL = 'http://localhost') {
  return { baseURL, model: 'test-model', maxRetries: 0 };
}

function translationRequests() {
  return [
    { messageId: 'search', source: '查询', locale: 'en-US' },
    {
      messageId: 'search.button',
      source: '查询',
      comment: '按钮',
      locale: 'en-US',
    },
    { messageId: 'search', source: '查询', locale: 'ja-JP' },
    {
      messageId: 'search.button',
      source: '查询',
      comment: '按钮',
      locale: 'ja-JP',
    },
  ];
}

function validPayload() {
  return {
    translations: [
      { 'en-US': 'Search', 'ja-JP': '検索' },
      { 'en-US': 'Search', 'ja-JP': '検索' },
    ],
  };
}

function validResults() {
  return [
    { messageId: 'search', locale: 'en-US', value: 'Search' },
    { messageId: 'search.button', locale: 'en-US', value: 'Search' },
    { messageId: 'search', locale: 'ja-JP', value: '検索' },
    { messageId: 'search.button', locale: 'ja-JP', value: '検索' },
  ];
}

function completion(payload: unknown): MockResponse {
  return {
    body: {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 0,
      model: 'test-model',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: JSON.stringify(payload) },
        },
      ],
    },
  };
}

async function startServer(
  handler: (
    request: IncomingMessage,
    body: Record<string, unknown>,
  ) => Promise<MockResponse>,
): Promise<string> {
  const server = createServer(async (request, response) => {
    const body = JSON.parse(await readBody(request)) as Record<string, unknown>;
    const result = await handler(request, body);
    response.statusCode = result.status ?? 200;
    response.setHeader('content-type', 'application/json');
    for (const [name, value] of Object.entries(result.headers ?? {})) {
      response.setHeader(name, value);
    }
    response.end(JSON.stringify(result.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
