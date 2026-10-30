import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { build } from 'vite';
import { expect, it } from 'vitest';
import { aiI18n } from '@ai-i18n/vite';
import { createDemoServer, type Scenario } from '../server/app.js';
import { createRemote } from '../remote.js';

it.each([
  ['ready', 'replace'],
  ['pending', 'replace'],
  ['invalid', 'replace'],
  ['partial', 'overlay'],
  ['withdrawn', 'overlay'],
] as const)(
  'builds against a real Hono HTTP server: %s',
  async (scenario: Scenario, mode: 'replace' | 'overlay') => {
    const root = path.resolve(import.meta.dirname, '..');
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ai-i18n-hono-build-'),
    );
    if (mode === 'overlay') {
      await fs.cp(
        path.join(root, 'i18n-overlay'),
        path.join(directory, 'i18n'),
        {
          recursive: true,
          filter: (file) =>
            !['extracted', 'locales'].includes(path.basename(file)),
        },
      );
    }
    const app = createDemoServer({ scenario });
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing address');
    try {
      const result = build({
        root,
        configFile: false,
        logLevel: 'silent',
        // Vitest 的 NODE_ENV=test 不等同于普通 Vite 生产进程。
        define: { 'import.meta.env.DEV': false },
        plugins: [
          aiI18n({
            sourceLang: 'zh-CN',
            defaultLang: 'en-US',
            locales: [
              { value: 'zh-CN', label: '中文' },
              { value: 'en-US', label: 'English' },
            ],
            directory: path.join(directory, 'i18n'),
            dts: false,
            failOnMissingTranslations: true,
            remote: createRemote(`http://127.0.0.1:${address.port}`, mode),
          }),
        ],
        build: { outDir: path.join(directory, 'dist'), write: false },
      });
      if (scenario === 'pending' || scenario === 'invalid') {
        await expect(result).rejects.toThrow(
          scenario === 'pending' ? /missing translations/ : /template tokens/,
        );
        return;
      }
      const output = await result;
      if (Array.isArray(output) || !('output' in output))
        throw new Error('Expected one build output');
      const code = output.output
        .filter((item) => item.type === 'chunk')
        .map((item) => item.code)
        .join('\n');
      expect(code).toContain(
        mode === 'replace'
          ? 'Saved successfully'
          : scenario === 'partial'
            ? 'Priority server copy'
            : 'Reviewed local save',
      );
      expect(code).toContain('Submit');
      expect(code).toContain('Commit');
      expect(code).toContain('demo-1');
      expect(code).not.toContain('Do not bundle this unrelated entry');
      expect(code).not.toContain('/api/demo/scenario');
      expect(code).not.toContain('node:crypto');
      if (mode === 'replace') {
        await expect(
          fs.stat(path.join(directory, 'i18n/translations')),
        ).rejects.toMatchObject({ code: 'ENOENT' });
      } else {
        const translations = path.join(directory, 'i18n/translations');
        const shards = (
          await fs.readdir(translations, { recursive: true })
        ).filter((file) => file.endsWith('.json'));
        const content = (
          await Promise.all(
            shards.map((file) =>
              fs.readFile(path.join(translations, file), 'utf8'),
            ),
          )
        ).join();
        expect(content).toContain('Local saved successfully');
        expect(content).not.toContain('Priority server copy');
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
