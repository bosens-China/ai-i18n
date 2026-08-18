import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, vi } from 'vitest';

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

export interface CapturedRequest {
  request: IncomingMessage;
  body: Record<string, unknown>;
}

interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body: unknown;
}

export function validOptions(baseURL = 'http://localhost') {
  return { baseURL, model: 'test-model', maxRetries: 0 };
}

export function translationBatch() {
  return {
    locales: ['en-US', 'ja-JP'],
    messages: [{ source: '查询' }, { source: '查询', comment: '按钮' }],
  };
}

export function singleLocaleBatch(source: string) {
  return { locales: ['en-US'], messages: [{ source }] };
}

export function validPayload() {
  return {
    translations: [
      { 'en-US': 'Search', 'ja-JP': '検索' },
      { 'en-US': 'Search', 'ja-JP': '検索' },
    ],
  };
}

export function validResults() {
  return [
    { 'en-US': 'Search', 'ja-JP': '検索' },
    { 'en-US': 'Search', 'ja-JP': '検索' },
  ];
}

export function completion(payload: unknown): MockResponse {
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

export async function startServer(
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
