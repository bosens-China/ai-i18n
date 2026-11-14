import { runInNewContext } from 'node:vm';
import { expect, test } from 'vitest';
import { repositoryRuntimeCode } from '../src/repository-runtime-code.js';

function deferred() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function runtimeHarness(
  groups: Record<string, string>,
  fetch: (url: string) => Promise<unknown>,
) {
  let current = 'zh-CN';
  const runtime = {
    ready: Promise.resolve(),
    getLang: () => current,
    setLang: async (locale: string) => {
      current = locale;
    },
  };
  const code = repositoryRuntimeCode(
    {
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
        { value: 'ja-JP', label: '日本語' },
      ],
      loading: { preload: [], prefetch: [] },
    },
    'vanilla',
    false,
    '/',
  )
    .replace(/^import .*;\r?\n/gmu, '')
    .replaceAll('export const ', 'const ');
  const api = (await runInNewContext(
    `(async () => { ${code}\nreturn { setLang, __loadFile }; })()`,
    {
      createI18nRuntime: () => runtime,
      createRepositoryScopedTranslate: () => () => '',
      formatTemplateMessage: () => '',
      fetch: (url: string) =>
        url.endsWith('manifest.json')
          ? Promise.resolve({ ok: true, json: async () => groups })
          : fetch(url),
    },
  )) as {
    setLang(locale: string): Promise<void>;
    __loadFile(file: string): Promise<void>;
  };
  return { api, getLang: () => current };
}

test('the latest language request wins even when its file packet resolves first', async () => {
  const english = deferred();
  const japanese = deferred();
  const { api, getLang } = await runtimeHarness({ file: 'group' }, (url) =>
    url.includes('en-US') ? english.promise : japanese.promise,
  );
  await api.__loadFile('file');
  const first = api.setLang('en-US');
  const second = api.setLang('ja-JP');
  japanese.resolve({ ok: true, json: async () => ({}) });
  await second;
  english.resolve({ ok: true, json: async () => ({}) });
  await first;
  expect(getLang()).toBe('ja-JP');
});

test('a file group discovered during a language switch loads the target packet', async () => {
  const firstPacket = deferred();
  const secondPacket = deferred();
  const requested: string[] = [];
  const { api, getLang } = await runtimeHarness(
    { first: 'one', second: 'two' },
    (url) => {
      requested.push(url);
      return url.endsWith('/one.json')
        ? firstPacket.promise
        : secondPacket.promise;
    },
  );
  await api.__loadFile('first');
  const switchLanguage = api.setLang('en-US');
  const loadSecond = api.__loadFile('second');
  firstPacket.resolve({ ok: true, json: async () => ({}) });
  secondPacket.resolve({ ok: true, json: async () => ({}) });
  await Promise.all([switchLanguage, loadSecond]);
  expect(getLang()).toBe('en-US');
  expect(requested.some((url) => url.endsWith('/en-US/two.json'))).toBe(true);
});
