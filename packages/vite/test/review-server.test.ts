import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { aiI18n, type AiI18nOptions } from '../src/index';
import { sqlite } from '@ai-i18n/sqlite';
import { aiI18nReview } from '../src/review';
import {
  REVIEW_CLIENT_MODULE_PATH,
  REVIEW_WORKBENCH_MODULE_PATH,
} from '../src/review-page';
import {
  buildFixture,
  connectHmr,
  fixtureRoot,
  options,
  start,
  startListening,
  write,
} from './review-server-test-utils';

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
      const html = await vite.transformIndexHtml(
        '/index.html',
        '<!doctype html><main></main>',
      );
      await vite.transformRequest('/src/main.ts');

      expect(html).toContain(
        `src="${REVIEW_CLIENT_MODULE_PATH}" data-ai-i18n-review`,
      );
      const reviewClient = await fetch(`${origin}${REVIEW_CLIENT_MODULE_PATH}`);
      const reviewClientCode = await reviewClient.text();
      expect(reviewClient.status, reviewClientCode).toBe(200);
      expect(reviewClientCode).toContain('mountReviewOverlay');

      const module = await fetch(`${origin}${REVIEW_WORKBENCH_MODULE_PATH}`);
      const code = await module.text();
      expect(module.status, code).toBe(200);
      expect(code).toContain('mountReviewWorkbench');
      expect(code).toContain('/__ai-i18n/src/mount.ts');
      const mount = await fetch(`${origin}/__ai-i18n/src/mount.ts`);
      const mountCode = await mount.text();
      expect(mount.status, mountCode).toBe(200);
      expect(mountCode).toContain('ai-i18n:review-ui.css?inline');
      const style = await fetch(
        `${origin}${REVIEW_WORKBENCH_MODULE_PATH.replace(/\.js$/, '.css')}?inline`,
      );
      expect(style.status).toBe(200);
      expect(style.headers.get('content-type')).toContain('text/javascript');
      expect(await style.text()).toContain('.review-root');

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
    await write(
      assets,
      'review-ui.js',
      'export const explicitReviewUi = true;',
    );
    process.env.AI_I18N_REVIEW_UI_DIR = assets;
    try {
      const root = await fixtureRoot();
      const { origin } = await start(root);
      await expect(
        fetch(`${origin}${REVIEW_WORKBENCH_MODULE_PATH}`).then((response) =>
          response.text(),
        ),
      ).resolves.toContain('explicitReviewUi');
    } finally {
      if (explicitReviewUiDirectory === undefined) {
        delete process.env.AI_I18N_REVIEW_UI_DIR;
      } else {
        process.env.AI_I18N_REVIEW_UI_DIR = explicitReviewUiDirectory;
      }
    }
  });

  it('serves the Shadow DOM workbench module and persists same-origin human decisions', async () => {
    const root = await fixtureRoot();
    await write(
      root,
      'src/main.ts',
      "import { t } from 'virtual:ai-i18n'; console.log(t('保存'))",
    );
    const { vite, origin } = await start(root);
    await vite.transformRequest('/src/main.ts');

    const removedPage = await fetch(`${origin}/__ai-i18n/`, {
      redirect: 'manual',
    });
    const removedHtml = await removedPage.text();
    expect(removedPage.status).not.toBe(302);
    expect(removedHtml).not.toContain('ai-i18n Review');

    const client = await fetch(new URL(REVIEW_WORKBENCH_MODULE_PATH, origin));
    const clientCode = await client.text();
    expect(client.headers.get('content-type')).toContain('text/javascript');
    expect(clientCode.length).toBeGreaterThan(10_000);
    expect(clientCode).toContain('mountReviewWorkbench');

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
        file: occurrence.sourceFile,
        location,
        value: 'Save',
      }),
    });
    expect(saved.status).toBe(200);
    const savedOverrides = JSON.parse(
      await fs.readFile(path.join(root, 'i18n/overrides.json'), 'utf8'),
    );
    expect(savedOverrides.rules[0]).toMatchObject({
      occurrences: [
        {
          file: occurrence.sourceFile,
          line: location.line,
          column: location.column,
        },
      ],
      translations: { 'en-US': 'Save' },
    });

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
        translationMemory: {
          storage: storage === 'sqlite' ? sqlite() : 'json',
        },
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

  it('keeps Review server registration separate from the core plugin', () => {
    expect(aiI18n(options).configureServer).toBeTypeOf('function');
    expect(aiI18nReview().configureServer).toBeTypeOf('function');
  });
});
