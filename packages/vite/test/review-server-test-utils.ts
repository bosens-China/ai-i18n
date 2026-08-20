import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { aiI18n, type AiI18nOptions } from '../src/index';
import { aiI18nReview } from '../src/review';
import { removeTempDir } from './temp-dir';

const tempDirs: string[] = [];
const servers: Array<{
  vite: ViteDevServer;
  http: http.Server;
}> = [];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');
const reviewRuntimeEntry = path.resolve('packages/vite/src/review-runtime.ts');
const previousReviewUiDirectory = process.env.AI_I18N_REVIEW_UI_DIR;

export const options = {
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
} satisfies AiI18nOptions;

beforeAll(() => {
  process.env.AI_I18N_REVIEW_UI_DIR = path.resolve('packages/review-ui/dist');
});

afterAll(() => {
  if (previousReviewUiDirectory === undefined) {
    delete process.env.AI_I18N_REVIEW_UI_DIR;
  } else {
    process.env.AI_I18N_REVIEW_UI_DIR = previousReviewUiDirectory;
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      ({ vite, http: server }) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            void vite.close().then(resolve);
          });
        }),
    ),
  );
  await Promise.all(
    tempDirs.splice(0).map((directory) => removeTempDir(directory)),
  );
});

export async function start(
  root: string,
  pluginOptions: AiI18nOptions = options,
) {
  const vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: {
      alias: {
        '@ai-i18n/vite/review/runtime': reviewRuntimeEntry,
        '@ai-i18n/vite/runtime': runtimeEntry,
      },
    },
    plugins: [aiI18n(pluginOptions), aiI18nReview()],
  });
  const server = http.createServer(vite.middlewares);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push({ vite, http: server });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return { vite, origin: `http://127.0.0.1:${address.port}` };
}

export async function startListening(
  root: string,
  pluginOptions: AiI18nOptions = options,
) {
  const vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    resolve: {
      alias: {
        '@ai-i18n/vite/review/runtime': reviewRuntimeEntry,
        '@ai-i18n/vite/runtime': runtimeEntry,
      },
    },
    plugins: [aiI18n(pluginOptions), aiI18nReview()],
  });
  await vite.listen();
  const server = vite.httpServer;
  if (!(server instanceof http.Server)) throw new Error('Missing HTTP server');
  servers.push({ vite, http: server });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return { vite, origin: `http://127.0.0.1:${address.port}` };
}

export async function buildFixture(
  root: string,
  pluginOptions: AiI18nOptions = options,
) {
  await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [aiI18n(pluginOptions)],
  });
}

export async function fixtureRoot() {
  const created = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-review-http-'),
  );
  const root = await fs.realpath(created);
  tempDirs.push(root);
  return root;
}

export async function write(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
}

export async function connectHmr(
  origin: string,
  token: string,
): Promise<unknown> {
  const socket = new WebSocket(
    `${origin.replace('http:', 'ws:')}/__ai-i18n/__vite_ws?token=${token}`,
    'vite-hmr',
  );
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out while connecting to review-ui HMR'));
    }, 2_000);
    socket.addEventListener(
      'message',
      (event) => {
        clearTimeout(timeout);
        socket.close();
        resolve(JSON.parse(String(event.data)));
      },
      { once: true },
    );
    socket.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(new Error('Failed to connect to review-ui HMR'));
      },
      { once: true },
    );
  });
}
