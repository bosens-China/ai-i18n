import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { build, createServer, type ViteDevServer } from 'vite';
import { aiI18n, type AiI18nOptions } from '../src/index';
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
} satisfies AiI18nOptions;
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

describe('review server', () => {
  it('serves the local review-ui source through its own Vite HMR channel', async () => {
    const explicitReviewUiDirectory = process.env.AI_I18N_REVIEW_UI_DIR;
    delete process.env.AI_I18N_REVIEW_UI_DIR;
    try {
      const root = await fixtureRoot();
      await write(
        root,
        'src/main.ts',
        "import { t } from 'virtual:ai-i18n'; console.log(t('本地开发'))",
      );
      const { vite, origin } = await startListening(root);
      await vite.transformRequest('/src/main.ts');

      const page = await fetch(`${origin}${REVIEW_PATH}`);
      const html = await page.text();
      expect(page.status, html).toBe(200);
      expect(html).toContain('src="/__ai-i18n/@vite/client"');
      expect(html).toContain('src="/__ai-i18n/src/main.ts"');

      const viteClient = await fetch(`${origin}/__ai-i18n/@vite/client`).then(
        (response) => response.text(),
      );
      expect(viteClient).toContain('/__ai-i18n/__vite_ws');
      const wsToken = viteClient.match(/const wsToken = "([^"]+)"/)?.[1];
      expect(wsToken).toBeTruthy();
      await expect(connectHmr(origin, wsToken!)).resolves.toMatchObject({
        type: 'connected',
      });

      const messages = await fetch(`${origin}/__ai-i18n/api/messages`).then(
        (response) => response.json(),
      );
      expect(messages.messages[0].message.source).toBe('本地开发');
    } finally {
      if (explicitReviewUiDirectory === undefined) {
        delete process.env.AI_I18N_REVIEW_UI_DIR;
      } else {
        process.env.AI_I18N_REVIEW_UI_DIR = explicitReviewUiDirectory;
      }
    }
  });

  it('prefers an explicit static review-ui directory over bundled assets', async () => {
    const explicitReviewUiDirectory = process.env.AI_I18N_REVIEW_UI_DIR;
    const assets = await fixtureRoot();
    await write(assets, 'index.html', '<h1>Explicit review UI</h1>');
    process.env.AI_I18N_REVIEW_UI_DIR = assets;
    try {
      const root = await fixtureRoot();
      const { origin } = await start(root);
      await expect(
        fetch(`${origin}${REVIEW_PATH}`).then((response) => response.text()),
      ).resolves.toContain('Explicit review UI');
    } finally {
      if (explicitReviewUiDirectory === undefined) {
        delete process.env.AI_I18N_REVIEW_UI_DIR;
      } else {
        process.env.AI_I18N_REVIEW_UI_DIR = explicitReviewUiDirectory;
      }
    }
  });

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

    const occurrence = messages.messages[0].occurrences[0];
    const location = occurrence.locations[0];
    const editorUrl = new URL('/__ai-i18n/api/editor', origin);
    editorUrl.searchParams.set('file', occurrence.sourceFile);
    editorUrl.searchParams.set('line', String(location.line));
    editorUrl.searchParams.set('column', String(location.column));
    const editor = await fetch(editorUrl, { redirect: 'manual' });
    const expectedEditorLocation = new URL('vscode://file');
    expectedEditorLocation.pathname = `${path.join(root, occurrence.sourceFile)}:${location.line}:${location.column + 1}`;
    expect(editor.status).toBe(302);
    expect(editor.headers.get('location')).toBe(expectedEditorLocation.href);

    const forgedEditorUrl = new URL(editorUrl);
    forgedEditorUrl.searchParams.set('file', '../outside.ts');
    const forgedEditor = await fetch(forgedEditorUrl, { redirect: 'manual' });
    expect(forgedEditor.status).toBe(404);
    await expect(forgedEditor.json()).resolves.toMatchObject({
      error: { code: 'UNKNOWN_SOURCE_LOCATION' },
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

  it.each(['json', 'sqlite'] as const)(
    'seeds direct Review access from the latest Build extraction snapshot with %s storage',
    async (storage) => {
      const root = await fixtureRoot();
      if (storage === 'sqlite') {
        vi.stubEnv('AI_I18N_DATA_DIR', path.join(root, 'user-data'));
      }
      const storageOptions: AiI18nOptions = {
        ...options,
        translationMemory: { storage },
      };
      await write(
        root,
        'index.html',
        '<script type="module" src="/src/main.ts"></script>',
      );
      await write(
        root,
        'src/main.ts',
        "import { t } from 'virtual:ai-i18n'; console.log(t('Build 快照'))",
      );
      await buildFixture(root, storageOptions);
      await expect(
        fs.readdir(path.join(root, 'i18n/extracted')),
      ).resolves.not.toHaveLength(0);

      const { origin } = await start(root, storageOptions);
      const response = await fetch(`${origin}/__ai-i18n/api/messages`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        messages: [
          {
            message: { source: 'Build 快照' },
            translations: { 'en-US': null },
            occurrences: [{ sourceFile: 'src/main.ts' }],
          },
        ],
      });
    },
  );

  it('can disable the default review server', () => {
    expect(aiI18n({ ...options, review: false }).configureServer).toBeTypeOf(
      'function',
    );
    expect(aiI18n(options).configureServer).toBeTypeOf('function');
  });
});

async function start(root: string, pluginOptions: AiI18nOptions = options) {
  const vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [aiI18n(pluginOptions)],
  });
  const server = http.createServer(vite.middlewares);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push({ vite, http: server });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return { vite, origin: `http://127.0.0.1:${address.port}` };
}

async function startListening(
  root: string,
  pluginOptions: AiI18nOptions = options,
) {
  const vite = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0 },
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [aiI18n(pluginOptions)],
  });
  await vite.listen();
  const server = vite.httpServer;
  if (!(server instanceof http.Server)) throw new Error('Missing HTTP server');
  servers.push({ vite, http: server });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return { vite, origin: `http://127.0.0.1:${address.port}` };
}

async function buildFixture(
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

async function connectHmr(origin: string, token: string): Promise<unknown> {
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
