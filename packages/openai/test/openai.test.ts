import type { AddressInfo } from 'node:net';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { openAI } from '../src/index';

const servers: Server[] = [];

afterEach(async () => {
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
  it('sends a structured batch with user configuration', async () => {
    let captured: CapturedRequest | undefined;
    const baseURL = await startServer(async (request, body) => {
      captured = { request, body };
      return completion({
        translations: [
          { messageId: 'save', locale: 'en-US', value: 'Save' },
          { messageId: 'save', locale: 'ja-JP', value: '保存' },
        ],
      });
    });
    const translator = openAI({
      baseURL: `${baseURL}/v1/`,
      model: 'chosen-model',
      prompt: 'Translate product interface messages.',
      apiKey: 'secret-key',
      headers: { 'x-provider-version': '2026-07-22' },
    });

    const results = await translator([
      { messageId: 'save', source: '保存', locale: 'en-US' },
      {
        messageId: 'save',
        source: '保存',
        comment: 'button',
        locale: 'ja-JP',
      },
    ]);

    expect(results).toEqual([
      { messageId: 'save', locale: 'en-US', value: 'Save' },
      { messageId: 'save', locale: 'ja-JP', value: '保存' },
    ]);
    expect(captured?.request.url).toBe('/v1/chat/completions');
    expect(captured?.request.headers.authorization).toBe('Bearer secret-key');
    expect(captured?.request.headers['x-provider-version']).toBe('2026-07-22');
    expect(captured?.body).toMatchObject({
      model: 'chosen-model',
      messages: [
        { role: 'system', content: 'Translate product interface messages.' },
        { role: 'user' },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'ai_i18n_translations', strict: true },
      },
    });
    const userMessage = (captured?.body.messages as Array<{ content: string }>)[1];
    expect(JSON.parse(userMessage!.content)).toEqual({
      requests: [
        { messageId: 'save', source: '保存', locale: 'en-US' },
        {
          messageId: 'save',
          source: '保存',
          comment: 'button',
          locale: 'ja-JP',
        },
      ],
    });
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
    const translator = openAI({
      ...validOptions('http://unused.invalid'),
      fetch: async () => {
        throw new Error('fetch should not run');
      },
    });

    await expect(translator([])).resolves.toEqual([]);
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
    ).rejects.toThrow('[ai-i18n/openai] invalid completion response');
  });

  it('requires base URL, model, and business prompt', () => {
    expect(() => openAI({ ...validOptions(), baseURL: ' ' })).toThrow(
      'baseURL is required',
    );
    expect(() => openAI({ ...validOptions(), model: ' ' })).toThrow(
      'model is required',
    );
    expect(() => openAI({ ...validOptions(), prompt: ' ' })).toThrow(
      'prompt is required',
    );
  });
});

interface CapturedRequest {
  request: IncomingMessage;
  body: Record<string, unknown>;
}

interface MockResponse {
  status?: number;
  body: unknown;
}

function validOptions(baseURL = 'http://localhost') {
  return { baseURL, model: 'test-model', prompt: 'Translate.' };
}

function completion(payload: unknown): MockResponse {
  return {
    body: {
      choices: [{ message: { content: JSON.stringify(payload) } }],
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
