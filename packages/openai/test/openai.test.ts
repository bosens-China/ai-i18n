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
    const baseURL = await startServer(async (request, body) => {
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

    expect(results).toEqual(validPayload().translations);
    expect(captured?.request.url).toBe('/v1/chat/completions');
    expect(captured?.request.headers.authorization).toBe('Bearer secret-key');
    expect(captured?.request.headers['x-provider-version']).toBe('2026-07-22');
    expect(captured?.body).toMatchObject({
      model: 'chosen-model',
      temperature: 0.25,
      max_tokens: 1_024,
      messages: [{ role: 'system' }, { role: 'user' }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'ai_i18n_translations', strict: true },
      },
    });
    const messages = captured?.body.messages as Array<{ content: string }>;
    expect(messages[0]!.content).toMatch(
      /^Translate product interface messages\.\n\n请仅以 JSON 返回/,
    );
    expect(messages[0]!.content).toContain(
      '{"translations":[{"messageId":"save","locale":"en-US","value":"Save"}]}',
    );
    expect(JSON.parse(messages[1]!.content)).toEqual({
      requests: translationRequests(),
    });
  });

  it('uses safe defaults and does not leak an environment key to a local endpoint', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'must-not-leak');
    let captured: CapturedRequest | undefined;
    const baseURL = await startServer(async (request, body) => {
      captured = { request, body };
      return completion({
        translations: [
          { messageId: 'save', locale: 'en-US', value: 'Save' },
        ],
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
    ).toContain('你是一名专业的软件界面本地化译者');
  });

  it('applies the configured request timeout', async () => {
    const baseURL = await startServer(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return completion({
        translations: [
          { messageId: 'save', locale: 'en-US', value: 'Save' },
        ],
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

  it('rejects missing, duplicate, extra, and malformed results', async () => {
    const invalidPayloads = [
      { translations: [] },
      {
        translations: [
          { messageId: 'save', locale: 'en-US', value: 'Save' },
          { messageId: 'save', locale: 'en-US', value: 'Again' },
        ],
      },
      {
        translations: [
          { messageId: 'other', locale: 'en-US', value: 'Other' },
        ],
      },
      { translations: [{ messageId: 'save', locale: 'en-US', value: 1 }] },
      {
        translations: [
          {
            messageId: 'save',
            locale: 'en-US',
            value: 'Save',
            unexpected: true,
          },
        ],
      },
    ];

    for (const payload of invalidPayloads) {
      const baseURL = await startServer(async () => completion(payload));
      const translator = openAI(validOptions(baseURL));
      await expect(
        translator([{ messageId: 'save', source: '保存', locale: 'en-US' }]),
      ).rejects.toThrow('[ai-i18n/openai] invalid translation result');
    }
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
    const invalidURL = await startServer(async () => ({ body: { choices: [] } }));

    await expect(
      openAI(validOptions(errorURL))([
        { messageId: 'save', source: '保存', locale: 'en-US' },
      ]),
    ).rejects.toThrow('[ai-i18n/openai] request failed with status 401');
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
    { messageId: 'save', source: '保存', locale: 'en-US' },
    {
      messageId: 'save',
      source: '保存',
      comment: 'button',
      locale: 'ja-JP',
    },
  ];
}

function validPayload() {
  return {
    translations: [
      { messageId: 'save', locale: 'en-US', value: 'Save' },
      { messageId: 'save', locale: 'ja-JP', value: '保存' },
    ],
  };
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
