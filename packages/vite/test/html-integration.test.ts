import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { aiI18n } from '../src';
import { buildOutputItems } from './build-output';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('HTML extractor integration', () => {
  it('transforms a Vite HTML entry and writes translated protocol files', async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ai-i18n-html-'),
    );
    const root = await fs.realpath(temporaryRoot);
    tempDirs.push(root);
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(
      path.join(root, 'index.html'),
      `<!doctype html><html><head><title>t('首页')</title></head>
       <body><input placeholder="t('请输入')"><script type="module" src="/src/main.ts"></script></body></html>`,
    );
    await fs.writeFile(path.join(root, 'src/main.ts'), 'console.log("ready")');
    const translator: Translator = vi.fn<Translator>(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: request.source === '首页' ? 'Home' : 'Type here',
      })),
    );

    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@ai-i18n/core': path.resolve('packages/core/src/index.ts'),
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          defaultLang: 'en-US',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          html: true,
          translator,
          provider: { batchLength: 12_000, strict: true },
        }),
      ],
      build: { write: false },
    });
    const outputItems = buildOutputItems(output);
    const htmlAsset = outputItems.find(
      (item) => item.type === 'asset' && item.fileName === 'index.html',
    );
    const clientCode = outputItems
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');
    expect(htmlAsset?.type).toBe('asset');
    const builtHtml = String(
      htmlAsset && 'source' in htmlAsset ? htmlAsset.source : '',
    );

    expect(builtHtml).toContain('data-ai-i18n-text=');
    expect(builtHtml).toContain('data-ai-i18n-attr-placeholder=');
    expect(builtHtml).toContain('>Home</title>');
    expect(builtHtml).toContain('placeholder="Type here"');
    expect(clientCode).toContain('首页');
    expect(clientCode).toContain('Home');
    expect(clientCode).toContain('请输入');
    expect(clientCode).toContain('Type here');
    expect(translator).toHaveBeenCalled();
    expect(
      await readJson(path.join(root, 'i18n/extracted/index.html.json')),
    ).toMatchObject({
      source: 'index.html',
      messages: [
        { id: '请输入', translations: { 'en-US': 'Type here' } },
        { id: '首页', translations: { 'en-US': 'Home' } },
      ],
    });
    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: { 首页: 'Home', 请输入: 'Type here' },
    });
  });

  it('keeps multiple HTML entries isolated', async () => {
    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ai-i18n-html-'),
    );
    const root = await fs.realpath(temporaryRoot);
    tempDirs.push(root);
    await fs.writeFile(
      path.join(root, 'index.html'),
      `<title>t('首页')</title>`,
    );
    await fs.writeFile(
      path.join(root, 'admin.html'),
      `<title>t('管理')</title>`,
    );

    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@ai-i18n/core': path.resolve('packages/core/src/index.ts'),
          '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
        },
      },
      plugins: [
        aiI18n({
          sourceLang: 'zh-CN',
          locales: [{ value: 'zh-CN', label: '中文' }],
          html: true,
        }),
      ],
      build: {
        write: false,
        rollupOptions: {
          input: {
            index: path.join(root, 'index.html'),
            admin: path.join(root, 'admin.html'),
          },
        },
      },
    });
    const assets = buildOutputItems(output).filter(
      (item) => item.type === 'asset',
    );

    expect(
      assets.find((item) => item.fileName === 'index.html')?.source,
    ).toContain('data-ai-i18n-text=');
    expect(
      assets.find((item) => item.fileName === 'admin.html')?.source,
    ).toContain('data-ai-i18n-text=');
    expect(
      await readJson(path.join(root, 'i18n/extracted/index.html.json')),
    ).toMatchObject({
      source: 'index.html',
      messages: [{ id: '首页' }],
    });
    expect(
      await readJson(path.join(root, 'i18n/extracted/admin.html.json')),
    ).toMatchObject({
      source: 'admin.html',
      messages: [{ id: '管理' }],
    });
  });
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}
