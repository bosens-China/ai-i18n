import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { aiI18n } from '../src/index';
import { REVIEW_PATH } from '../src/review-page';
import { removeTempDir } from './temp-dir';

const tempDirs: string[] = [];
const servers: Array<{
  vite: ViteDevServer;
  http: http.Server;
}> = [];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');
const options = {
  sourceLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};
const previousReviewUiDirectory = process.env.AI_I18N_REVIEW_UI_DIR;

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

describe('review server', () => {
  it('serves the review page and persists same-origin human decisions', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'src/main.ts',
      "import { t } from 'virtual:ai-i18n'; console.log(t('保存'))",
    );
    const { vite, origin } = await start(root);
    await vite.transformRequest('/src/main.ts');

    const page = await fetch(`${origin}${REVIEW_PATH}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('ai-i18n Review');
    expect(page.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );

    const clientPath = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    const stylePath = html.match(/<link[^>]+href="([^"]+\.css)"/)?.[1];
    expect(clientPath).toMatch(/^\/__ai-i18n\/assets\//);
    expect(stylePath).toMatch(/^\/__ai-i18n\/assets\//);
    const client = await fetch(new URL(clientPath!, origin));
    const style = await fetch(new URL(stylePath!, origin));
    expect(client.headers.get('content-type')).toContain('text/javascript');
    expect(style.headers.get('content-type')).toContain('text/css');
    expect((await client.text()).length).toBeGreaterThan(10_000);
    expect((await style.text()).length).toBeGreaterThan(1_000);

    const messages = await fetch(`${origin}/__ai-i18n/api/messages`).then(
      (response) => response.json(),
    );
    expect(messages.messages[0]).toMatchObject({
      message: { source: '保存' },
      translations: { 'en-US': null },
    });

    const saved = await fetch(`${origin}/__ai-i18n/api/overrides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin,
      },
      body: JSON.stringify({
        message: { source: '保存' },
        locale: 'en-US',
        value: 'Save',
      }),
    });
    expect(saved.status).toBe(200);
    await expect(
      fs.readFile(path.join(root, 'i18n/overrides.json'), 'utf8'),
    ).resolves.toContain('Save');

    const rejected = await fetch(`${origin}/__ai-i18n/api/overrides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://example.com',
      },
      body: JSON.stringify({
        message: { source: '保存' },
        locale: 'en-US',
        value: 'Unsafe',
      }),
    });
    expect(rejected.status).toBe(403);
    expect(await rejected.json()).toMatchObject({
      error: { code: 'SAME_ORIGIN_REQUIRED' },
    });

    const forgedScheme = await fetch(`${origin}/__ai-i18n/api/overrides`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: origin.replace('http:', 'https:'),
      },
      body: JSON.stringify({
        message: { source: '保存' },
        locale: 'en-US',
        value: 'Unsafe',
      }),
    });
    expect(forgedScheme.status).toBe(403);

    const method = await fetch(`${origin}/__ai-i18n/api/overrides`);
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('POST, DELETE');
  });

  it('can disable the default review server', () => {
    expect(
      aiI18n({ ...options, review: false }).configureServer,
    ).toBeUndefined();
    expect(aiI18n(options).configureServer).toBeTypeOf('function');
  });
});

async function start(root: string) {
  const vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [aiI18n(options)],
  });
  const server = http.createServer(vite.middlewares);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push({ vite, http: server });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return { vite, origin: `http://127.0.0.1:${address.port}` };
}

async function fixtureRoot() {
  const created = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-review-http-'),
  );
  const root = await fs.realpath(created);
  tempDirs.push(root);
  return root;
}

async function write(root: string, relative: string, content: string) {
  const filename = path.join(root, relative);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content);
}
