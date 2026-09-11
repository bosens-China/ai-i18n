import type { IncomingMessage, ServerResponse } from 'node:http';
import { ReviewProblem } from './review-problem.js';

const MAX_BODY_BYTES = 64 * 1024;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Review UI 会把随包 CSS 注入工作台根节点；独立页需要显式允许这段内联样式。
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "frame-ancestors 'self'",
  "form-action 'none'",
].join('; ');

export function assertWriteRequest(request: IncomingMessage): void {
  const type = request.headers['content-type'];
  if (!type?.toLowerCase().startsWith('application/json')) {
    throw problem(
      'JSON_REQUIRED',
      415,
      '校对写入只接受 JSON 请求。',
      'Review writes only accept JSON requests.',
    );
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host || !sameOrigin(request, origin, host)) {
    throw problem(
      'SAME_ORIGIN_REQUIRED',
      403,
      '校对写入只接受当前 Vite 页面发起的同源请求。',
      'Review writes only accept same-origin requests from the current Vite page.',
    );
  }
}

function sameOrigin(
  request: IncomingMessage,
  origin: string,
  host: string,
): boolean {
  try {
    const secure =
      'encrypted' in request.socket && request.socket.encrypted === true;
    return new URL(origin).origin === `${secure ? 'https' : 'http'}://${host}`;
  } catch {
    return false;
  }
}

export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw problem(
        'BODY_TOO_LARGE',
        413,
        '校对请求内容超过 64 KiB 限制。',
        'The review request exceeds the 64 KiB limit.',
      );
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw problem(
      'INVALID_JSON',
      400,
      '校对请求不是合法 JSON。',
      'The review request is not valid JSON.',
    );
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  send(
    response,
    status,
    'application/json; charset=utf-8',
    JSON.stringify(value),
    false,
  );
}

export function send(
  response: ServerResponse,
  status: number,
  contentType: string,
  body: string | Buffer,
  pageAsset: boolean,
): void {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (pageAsset) {
    response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  }
  response.end(body);
}

export function problem(
  code: string,
  status: number,
  zh: string,
  en: string,
): ReviewProblem {
  return new ReviewProblem(code, status, zh, en);
}
