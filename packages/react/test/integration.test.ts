import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import reactPlugin from '@vitejs/plugin-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build } from 'vite';
import { aiI18n } from '@ai-i18n/vite';
import { react } from '../src/vite';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((directory) =>
      fs.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('@ai-i18n/react Vite integration', () => {
  it('builds TSX and writes translated protocol files', async () => {
    const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-react-'));
    const root = await fs.realpath(temporaryRoot);
    tempDirs.push(root);
    await fs.mkdir(path.join(root, 'src'));
    const entry = path.join(root, 'src/App.tsx');
    await fs.writeFile(
      entry,
      `import { useI18n } from '@ai-i18n/react';
export function App() {
  const { t } = useI18n();
  return <main title="普通属性"><h1>{t('标题')}</h1>普通 JSXText</main>;
}`,
    );
    const translator: Translator = vi.fn(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: 'Title',
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
          '@ai-i18n/react': path.resolve('packages/react/src/index.ts'),
        },
      },
      plugins: [
        reactPlugin(),
        aiI18n({
          sourceLang: 'zh-CN',
          defaultLang: 'en-US',
          locales: [
            { value: 'zh-CN', label: '中文' },
            { value: 'en-US', label: 'English' },
          ],
          extractors: [react()],
          translator,
          provider: { batchSize: 10, strict: true },
        }),
      ],
      build: {
        write: false,
        lib: { entry, formats: ['es'] },
        rollupOptions: {
          external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
        },
      },
    });
    const code = (Array.isArray(output) ? output : [output])
      .flatMap((item) => item.output)
      .filter((item) => item.type === 'chunk')
      .map((item) => item.code)
      .join('\n');

    expect(code).toContain('Title');
    expect(translator).toHaveBeenCalled();
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/App.tsx.json')),
    ).toMatchObject({
      source: 'src/App.tsx',
      messages: [{ id: '标题', locations: [{ line: 4 }] }],
    });
  });
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}
