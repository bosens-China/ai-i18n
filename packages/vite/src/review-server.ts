import fs from 'node:fs/promises';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ViteDevServer } from 'vite';
import { diagnosticMessage } from '@ai-i18n/analyzer';
import type { ReviewSnapshot } from '@ai-i18n/core';
import { readReviewAsset } from './review-assets.js';
import {
  REVIEW_API_PATH,
  REVIEW_BASE_PATH,
  REVIEW_EDITOR_PATH,
  REVIEW_OVERRIDE_PATH,
} from './review-page.js';
import type {
  ReviewOverrideTarget,
  ReviewOverrideUpdate,
  ReviewService,
} from './review-service.js';
import { ReviewProblem } from './review-service.js';
import {
  printReviewUrl,
  readReviewStandaloneAsset,
} from './review-standalone.js';
import { createReviewUiDevServer } from './review-ui-dev.js';

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

export async function configureReviewServer(
  server: ViteDevServer,
  service: ReviewService,
  options: { printUrl?: boolean } = {},
): Promise<void> {
  const reviewUiDevServer = await createReviewUiDevServer(server);
  if (options.printUrl !== false) printReviewUrl(server);

  server.middlewares.use(async (request, response, next) => {
    const pathname = request.url?.split('?', 1)[0];
    if (!pathname?.startsWith(REVIEW_BASE_PATH.slice(0, -1))) return next();
    try {
      if (
        request.method === 'GET' &&
        pathname === REVIEW_BASE_PATH.slice(0, -1)
      ) {
        response.statusCode = 302;
        response.setHeader('Location', REVIEW_BASE_PATH);
        response.end();
        return;
      }
      const standaloneAsset =
        request.method === 'GET'
          ? readReviewStandaloneAsset(pathname)
          : undefined;
      if (standaloneAsset) {
        send(
          response,
          200,
          standaloneAsset.contentType,
          standaloneAsset.body,
          standaloneAsset.html,
        );
        return;
      }
      if (request.method === 'GET' && pathname === REVIEW_API_PATH) {
        sendJson(response, 200, await service.snapshot());
        return;
      }
      if (request.method === 'GET' && pathname === REVIEW_EDITOR_PATH) {
        response.statusCode = 302;
        response.setHeader(
          'Location',
          await editorLocation(request, server, await service.snapshot()),
        );
        response.end();
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
        if (reviewUiDevServer) {
          reviewUiDevServer.middlewares(request, response, next);
          return;
        }
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
}

interface SourceLocationTarget {
  file: string;
  line: number;
  column: number;
}
async function editorLocation(
  request: IncomingMessage,
  server: ViteDevServer,
  snapshot: ReviewSnapshot,
): Promise<string> {
  const target = parseEditorTarget(request.url);
  if (!snapshotContainsLocation(snapshot, target)) {
    throw problem(
      'UNKNOWN_SOURCE_LOCATION',
      404,
      '该源码位置不在当前校对快照中。请刷新校对页面后重试。',
      'This source location is not in the current review snapshot. Refresh the review page and try again.',
    );
  }
  const root = await fs.realpath(server.config.root);
  const sourceFile = await fs.realpath(path.resolve(root, target.file));
  if (!isWithinRoot(root, sourceFile)) {
    throw problem(
      'INVALID_SOURCE_LOCATION',
      400,
      '源码位置不在当前 Vite 项目内。',
      'The source location is outside the current Vite project.',
    );
  }
  const vscode = new URL('vscode://file');
  // VS Code 使用 1-based 列号，而提取器的 column 是 0-based。
  vscode.pathname = `${sourceFile}:${target.line}:${target.column + 1}`;
  return vscode.href;
}
function parseEditorTarget(url: string | undefined): SourceLocationTarget {
  const search = new URL(url ?? '/', 'http://review.local').searchParams;
  const file = search.get('file');
  const line = parsePositiveInteger(search.get('line'));
  const column = parseNonNegativeInteger(search.get('column'));
  if (!file || line === undefined || column === undefined) {
    throw problem(
      'INVALID_SOURCE_LOCATION',
      400,
      '源码定位请求缺少合法的文件路径或位置。',
      'The source navigation request is missing a valid file path or location.',
    );
  }
  return { file, line, column };
}
function parsePositiveInteger(value: string | null): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}
function parseNonNegativeInteger(value: string | null): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

function snapshotContainsLocation(
  snapshot: ReviewSnapshot,
  target: SourceLocationTarget,
): boolean {
  return snapshot.messages.some((message) =>
    message.occurrences.some(
      (occurrence) =>
        occurrence.sourceFile === target.file &&
        occurrence.locations.some(
          (location) =>
            location.line === target.line && location.column === target.column,
        ),
    ),
  );
}

function isWithinRoot(root: string, sourceFile: string): boolean {
  const relative = path.relative(root, sourceFile);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
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
    (value.file !== undefined && typeof value.file !== 'string') ||
    (value.location !== undefined && !parseReviewLocation(value.location)) ||
    (value.location !== undefined && !value.file)
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
    ...(value.location
      ? { location: parseReviewLocation(value.location)! }
      : {}),
  };
}

function parseReviewLocation(
  value: unknown,
): { line: number; column: number } | undefined {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.line) ||
    (value.line as number) < 1 ||
    !Number.isSafeInteger(value.column) ||
    (value.column as number) < 0
  ) {
    return undefined;
  }
  return { line: value.line as number, column: value.column as number };
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
