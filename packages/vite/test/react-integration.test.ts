import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import reactPlugin from '@vitejs/plugin-react';
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

describe('React Vite integration', () => {
  it('auto-detects React and extracts TS and TSX Hooks', async () => {
    const root = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-react-')),
    );
    tempDirs.push(root);
    await fs.mkdir(path.join(root, 'src'));
    const entry = path.join(root, 'src/App.tsx');
    await fs.writeFile(
      path.join(root, 'src/useLabel.ts'),
      `export function useLabel() {
  const i18n = useI18n()
  return i18n.t('React TS')
}`,
    );
    await fs.writeFile(
      entry,
      `import { useLabel } from './useLabel'
export function App() {
  const { t } = useI18n()
  return <main><h1>{t('React TSX')}</h1><p>{useLabel()}</p></main>
}`,
    );
    const translator: Translator = vi.fn<Translator>(async (requests) =>
      requests.map((request) => ({
        messageId: request.messageId,
        locale: request.locale,
        value: `EN:${request.source}`,
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
          '@ai-i18n/vite/react': path.resolve('packages/vite/src/react.ts'),
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
          loading: { strategy: 'locale' },
          translator,
          provider: { batchLength: 12_000, strict: true },
        }),
        { name: 'unplugin-auto-import' },
        reactPlugin(),
      ],
      build: {
        write: false,
        lib: { entry, formats: ['es'] },
        rollupOptions: {
          external: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
        },
      },
    });
    const outputChunks = buildOutputItems(output).filter(
      (item) => item.type === 'chunk',
    );
    const code = outputChunks.map((item) => item.code).join('\n');
    const localeChunk = outputChunks.find((item) =>
      item.code.includes('EN:React TSX'),
    );

    expect(code).toContain('EN:React TSX');
    expect(code).toContain('EN:React TS');
    expect(localeChunk?.isEntry).toBe(false);
    expect(localeChunk?.fileName).toMatch(/^en-US-|^assets\/en-US-/);
    expect(translator).toHaveBeenCalled();
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/App.tsx.json')),
    ).toMatchObject({ messages: [{ id: 'React TSX' }] });
    expect(
      await readJson(path.join(root, 'i18n/extracted/src/useLabel.ts.json')),
    ).toMatchObject({ messages: [{ id: 'React TS' }] });
  });
});

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
}
