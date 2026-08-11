import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import { readReviewAsset } from './review-assets.js';
import {
  REVIEW_API_PATH,
  REVIEW_OVERRIDE_PATH,
  REVIEW_PATH,
} from './review-page.js';
import type {
  ReviewOverrideTarget,
  ReviewOverrideUpdate,
  ReviewService,
} from './review-service.js';
import { ReviewProblem } from './review-service.js';

const MAX_BODY_BYTES = 64 * 1024;
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ');

export function configureReviewServer(
  server: ViteDevServer,
  service: ReviewService,
): void {
  server.middlewares.use(async (request, response, next) => {
    const pathname = request.url?.split('?', 1)[0];
    if (!pathname?.startsWith(REVIEW_PATH.slice(0, -1))) return next();
    try {
      if (pathname === REVIEW_PATH.slice(0, -1)) {
        response.statusCode = 302;
        response.setHeader('Location', REVIEW_PATH);
        response.end();
        return;
      }
      if (request.method === 'GET' && pathname === REVIEW_API_PATH) {
        sendJson(response, 200, await service.snapshot());
        return;
      }
      if (pathname === REVIEW_OVERRIDE_PATH) {
        if (request.method === 'POST') {
          assertWriteRequest(request);
          const update = parseOverrideUpdate(await readJsonBody(request));
          sendJson(response, 200, await service.setOverride(update));
          return;
        }
        if (request.method === 'DELETE') {
          assertWriteRequest(request);
          const target = parseOverrideTarget(await readJsonBody(request));
          sendJson(response, 200, await service.deleteOverride(target));
          return;
        }
        response.setHeader('Allow', 'POST, DELETE');
        throw problem(
          'METHOD_NOT_ALLOWED',
          405,
          '该校对接口不支持当前请求方法。',
          'This review endpoint does not support the current request method.',
        );
      }
      if (request.method === 'GET') {
        const asset = await readReviewAsset(pathname);
        if (asset) {
          send(response, 200, asset.contentType, asset.body, asset.html);
          return;
        }
      }
      next();
    } catch (cause) {
      const error =
        cause instanceof ReviewProblem
          ? cause
          : problem(
              'INTERNAL_ERROR',
              500,
              '校对操作失败，请查看 Vite 控制台并重试。',
              'The review operation failed. Check the Vite console and try again.',
            );
      if (!(cause instanceof ReviewProblem)) {
        server.config.logger.error(
          diagnosticMessage(
            `[ai-i18n] 翻译校对请求失败：${errorReason(cause)}`,
            `[ai-i18n] Review request failed: ${errorReason(cause)}`,
          ),
        );
      }
      sendJson(response, error.status, {
        error: { code: error.code, zh: error.zh, en: error.en },
      });
    }
  });

  server.httpServer?.once('listening', () => {
    setTimeout(() => printReviewUrl(server), 0);
  });
}

function printReviewUrl(server: ViteDevServer): void {
  const serverUrl =
    server.resolvedUrls?.local[0] ?? server.resolvedUrls?.network[0];
  if (!serverUrl) return;
  const reviewUrl = new URL(REVIEW_PATH, new URL(serverUrl).origin).href;
  server.config.logger.info(`  ➜  ai-i18n Review: ${reviewUrl}`);
}

function assertWriteRequest(request: IncomingMessage): void {
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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
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

function parseOverrideUpdate(value: unknown): ReviewOverrideUpdate {
  const target = parseOverrideTarget(value);
  if (!isRecord(value) || typeof value.value !== 'string') {
    throw invalidInput();
  }
  return { ...target, value: value.value };
}

function parseOverrideTarget(value: unknown): ReviewOverrideTarget {
  if (
    !isRecord(value) ||
    !isRecord(value.message) ||
    typeof value.message.source !== 'string' ||
    value.message.source.length === 0 ||
    (value.message.comment !== undefined &&
      typeof value.message.comment !== 'string') ||
    typeof value.locale !== 'string' ||
    value.locale.length === 0 ||
    (value.file !== undefined && typeof value.file !== 'string')
  ) {
    throw invalidInput();
  }
  return {
    message: {
      source: value.message.source,
      ...(value.message.comment ? { comment: value.message.comment } : {}),
    },
    locale: value.locale,
    ...(value.file ? { file: value.file } : {}),
  };
}

function invalidInput(): ReviewProblem {
  return problem(
    'INVALID_INPUT',
    400,
    '校对请求缺少合法的文案、目标语言、范围或译文。',
    'The review request is missing a valid message, locale, scope, or value.',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sendJson(
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

function send(
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

function errorReason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function problem(
  code: string,
  status: number,
  zh: string,
  en: string,
): ReviewProblem {
  return new ReviewProblem(code, status, zh, en);
}
