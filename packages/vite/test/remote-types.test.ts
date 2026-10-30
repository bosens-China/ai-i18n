import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, expect, it } from 'vitest';
import { writeFrameworkTypes } from '../src/framework-dts';

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

it('shares registered metadata between inline options, adapters and generated browser declarations', async () => {
  const root = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-remote-types-'),
  );
  roots.push(root);
  await writeFrameworkTypes(root, 'vanilla', false);
  await fs.writeFile(
    path.join(root, 'src/meta.d.ts'),
    `
import '@ai-i18n/vite/runtime';
declare module '@ai-i18n/vite/runtime' {
  interface Register { translationMeta: { version: string; environment: 'preview' | 'production' } }
}`,
  );
  await fs.writeFile(
    path.join(root, 'src/app.ts'),
    `
import { aiI18n } from '@ai-i18n/vite';
import { defineRemote, type RemoteSnapshot } from '@ai-i18n/vite/remote';
import { getTranslationMeta } from 'virtual:ai-i18n';
const remote = defineRemote({ async load(context) {
  const source: string = context.messages[0]!.source;
  return { translations: [], publicMeta: { version: source, environment: 'production' } };
} });
aiI18n({ sourceLang: 'en', locales: [{ value: 'en', label: 'English' }], remote });
aiI18n({ sourceLang: 'en', locales: [{ value: 'en', label: 'English' }], remote: {
  async load(context) { return { translations: [], publicMeta: { version: context.sourceLang, environment: 'preview' } }; }
} });
const meta = getTranslationMeta();
if (meta) {
  const version: string = meta.version;
  const environment: 'preview' | 'production' = meta.environment;
  console.log(version, environment);
  // @ts-expect-error unknown metadata field
  meta.unknown;
  // @ts-expect-error metadata is read-only
  meta.version = 'other';
}
// @ts-expect-error absent metadata must be handled
getTranslationMeta().version;
// @ts-expect-error producer must satisfy the same registration
const bad: RemoteSnapshot = { translations: [], publicMeta: { version: 42, environment: 'production' } };
void bad;
`,
  );
  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        types: [],
        paths: {
          '@ai-i18n/vite': [path.resolve('packages/vite/dist/index.d.ts')],
          '@ai-i18n/vite/remote': [
            path.resolve('packages/vite/dist/remote.d.ts'),
          ],
          '@ai-i18n/vite/runtime': [
            path.resolve('packages/vite/dist/runtime.d.ts'),
          ],
        },
      },
      include: ['src/**/*.ts'],
    }),
  );
  const result = await exec(process.execPath, [
    path.resolve('node_modules/typescript/bin/tsc'),
    '-p',
    path.join(root, 'tsconfig.json'),
  ]);
  expect(result.stdout).toBe('');
});
