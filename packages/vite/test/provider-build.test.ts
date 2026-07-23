import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@boses/core';
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

describe('@boses/vite provider build', () => {
  it('waits for static and dynamic module translations and writes files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-vite-'));
    tempDirs.push(root);
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(
      path.join(root, 'src/main.ts'),
      `import { t } from 'virtual:ai-i18n';
       import { HOME } from '@texts';
       console.log(t(HOME));
       void import('./lazy');`,
    );
    await fs.writeFile(
      path.join(root, 'src/texts.ts'),
      `export const HOME = '首页';`,
    );
    await fs.writeFile(
      path.join(root, 'src/lazy.ts'),
      `import { t } from 'virtual:ai-i18n'; console.log(t('懒加载'));`,
    );

    const translator: Translator = vi.fn<Translator>(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: request.source === '首页' ? 'Home' : 'Lazy',
      })),
    );
    const output = await build({
      root,
      configFile: false,
      logLevel: 'silent',
      resolve: {
        alias: {
          '@boses/core': path.resolve('packages/core/src/index.ts'),
          '@boses/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
          '@texts': path.join(root, 'src/texts.ts'),
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
          translator,
          provider: { debounceMs: 60_000, strict: true },
        }),
      ],
      build: {
        write: false,
        sourcemap: true,
        lib: { entry: path.join(root, 'src/main.ts'), formats: ['es'] },
      },
    });
    const chunks = buildOutputItems(output).filter(
      (item) => item.type === 'chunk',
    );
    const code = chunks.map((item) => item.code).join('\n');

    expect(code).toContain('src/main.ts');
    expect(code).toContain('首页');
    expect(code).toContain('src/lazy.ts');
    expect(code).toContain('懒加载');
    expect(code).toContain('Home');
    expect(code).toContain('Lazy');
    expect(translator).toHaveBeenCalled();
    expect(
      chunks.some((chunk) =>
        chunk.map?.sources.some((source) => source.endsWith('/src/main.ts')),
      ),
    ).toBe(true);
    expect(await readJson(path.join(root, 'i18n/cache.json'))).toMatchObject({
      messages: {
        首页: { translations: { 'en-US': 'Home' } },
        懒加载: { translations: { 'en-US': 'Lazy' } },
      },
    });
    expect(
      await readJson(path.join(root, 'i18n/locales/en-US.json')),
    ).toMatchObject({
      messages: { 首页: 'Home', 懒加载: 'Lazy' },
    });
  });
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}
