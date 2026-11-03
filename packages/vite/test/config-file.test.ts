import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { build, createServer } from 'vite';
import { aiI18n } from '../src/config-plugin';
import { loadAiI18nConfig } from '../src/config';
import { aiI18nPluginApi } from '../src/plugin-api';
import { scanProject, scanConfiguredProject } from '../src/scan';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-config-')),
  );
  roots.push(root);
  await fs.writeFile(
    path.join(root, 'copy.ts'),
    "export const language = 'en';",
  );
  await fs.writeFile(
    path.join(root, 'ai-i18n.config.ts'),
    `import {language} from './copy';
export default {sourceLang:'zh',locales:[{value:'zh',label:'中文'},{value:language,label:'Target'}],autoImport:true,dts:false};`,
  );
  await fs.writeFile(
    path.join(root, 'index.html'),
    '<script type="module" src="/main.ts"></script>',
  );
  await fs.writeFile(path.join(root, 'main.ts'), "console.log(t('保存')); ");
  return root;
}
function options(root: string) {
  return {
    root,
    configFile: false as const,
    logLevel: 'silent' as const,
    plugins: [aiI18n()],
    resolve: {
      alias: {
        '@ai-i18n/vite/runtime': path.resolve('packages/vite/src/runtime.ts'),
      },
    },
  };
}

it('uses a custom root and config-relative directories consistently for build and selected scanning', async () => {
  const base = await fixture();
  const root = path.join(base, 'client');
  await fs.mkdir(root);
  for (const file of ['index.html', 'main.ts'])
    await fs.copyFile(path.join(base, file), path.join(root, file));
  const file = path.join(base, 'ai-i18n.config.ts');
  const text = await fs.readFile(file, 'utf8');
  await fs.writeFile(
    file,
    text.replace(
      'sourceLang:',
      "root:'client', directory:'custom-i18n', sourceLang:",
    ),
  );
  const input = { ...options(root), plugins: [aiI18n({ configFile: file })] };
  await build({ ...input, build: { write: false } });
  expect((await scanConfiguredProject(file, input)).i18n_directory).toBe(
    path.join(base, 'custom-i18n'),
  );
  await expect(fs.access(path.join(root, 'i18n'))).rejects.toMatchObject({
    code: 'ENOENT',
  });
});

it('loads shared TS imports and resolves paths relative to the config, independent of cwd', async () => {
  const root = await fixture();
  const result = await loadAiI18nConfig(path.join(root, 'ai-i18n.config.ts'));
  expect(result.options.directory).toBe(path.join(root, 'i18n'));
  expect(result.dependencies.map((file) => path.basename(file))).toContain(
    'copy.ts',
  );
  expect(result.options.locales[1]?.value).toBe('en');
});
it('builds and scans through the public file-config plugin', async () => {
  const root = await fixture();
  await build({ ...options(root), build: { write: false, minify: false } });
  expect((await scanProject(options(root))).message_count).toBe(1);
});
it('reloads imported configuration on Dev restart', async () => {
  const root = await fixture();
  const server = await createServer({
    ...options(root),
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const initial = server.config;
    await fs.writeFile(
      path.join(root, 'copy.ts'),
      "export const language = 'ja';",
    );
    await vi.waitFor(
      () => {
        expect(server.config).not.toBe(initial);
        const api = server.config.plugins.map(aiI18nPluginApi).find(Boolean);
        expect(api?.options.locales[1]?.value).toBe('ja');
      },
      { timeout: 15000 },
    );
  } finally {
    await server.close();
  }
}, 20000);
it('rejects missing configs, inline options, and a mismatched Vite root', async () => {
  const root = await fixture();
  expect(() => aiI18n({ sourceLang: 'zh' } as never)).toThrow(
    /ai-i18n.config.ts/,
  );
  await expect(loadAiI18nConfig(path.join(root, 'missing.ts'))).rejects.toThrow(
    /missing.ts/,
  );
  await fs.mkdir(path.join(root, 'nested'));
  await expect(
    build({
      ...options(path.join(root, 'nested')),
      plugins: [aiI18n({ configFile: '../ai-i18n.config.ts' })],
    }),
  ).rejects.toThrow(/root/);
});
