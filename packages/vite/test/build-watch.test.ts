import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type Plugin } from 'vite';
import { aiI18n, Analyzer } from '../src';

const tempDirs: string[] = [];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');
const locales = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
];

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Vite build watch', () => {
  it('reuses analysis state for direct and static dependency updates', async () => {
    const root = await fixtureRoot();
    const main = path.join(root, 'src/main.ts');
    const texts = path.join(root, 'src/texts.ts');
    const mainCode = `import { t } from 'virtual:ai-i18n';
import { LABEL } from './texts';
console.log(t(LABEL));`;
    await write(root, 'src/main.ts', mainCode);
    await write(root, 'src/texts.ts', "export const LABEL = '首页';");
    const translator = translating({ 首页: 'Home', 设置: 'Settings' });
    const observations: Observation[] = [];
    const addFile = vi.spyOn(Analyzer.prototype, 'addFile');
    const watcher = await startWatch(root, translator, observations);

    try {
      await waitForBuild(watcher, observations, 0);
      expect(lastRegistration(observations, 'src/main.ts')).toContain(
        '"en-US":{"首页":"Home"}',
      );
      expect(translator).toHaveBeenCalledTimes(1);
      addFile.mockClear();

      await rebuild(watcher, observations, () =>
        fs.writeFile(main, mainCode.replace('console.log', 'console.info')),
      );
      expect(addFile.mock.calls.map(([moduleId]) => moduleId)).toEqual([
        'src/main.ts',
      ]);
      expect(translator).toHaveBeenCalledTimes(1);
      addFile.mockClear();

      const nextTexts = "export const LABEL = '设置';";
      await rebuild(watcher, observations, () =>
        fs.writeFile(texts, nextTexts),
      );
      expect(addFile.mock.calls.map(([moduleId]) => moduleId)).toEqual([
        'src/texts.ts',
      ]);
      expect(lastRegistration(observations, 'src/main.ts')).toContain(
        '"en-US":{"设置":"Settings"}',
      );
      expect(translator).toHaveBeenCalledTimes(2);
      addFile.mockClear();

      const before = await protocolModifiedTimes(root);
      const registration = lastRegistration(observations, 'src/main.ts');
      await rebuild(watcher, observations, () =>
        fs.writeFile(texts, nextTexts),
      );
      expect(await protocolModifiedTimes(root)).toEqual(before);
      expect(lastRegistration(observations, 'src/main.ts')).toBe(registration);
      expect(addFile).not.toHaveBeenCalled();
      expect(translator).toHaveBeenCalledTimes(2);
    } finally {
      addFile.mockRestore();
      await watcher.close();
    }
  });

  it('reconciles extracted and locale edits without parsing source again', async () => {
    const root = await fixtureRoot();
    await write(root, 'src/main.ts', translatedModule('首页'));
    const observations: Observation[] = [];
    const addFile = vi.spyOn(Analyzer.prototype, 'addFile');
    const watcher = await startWatch(root, undefined, observations);

    try {
      await waitForBuild(watcher, observations, 0);
      addFile.mockClear();
      const extractedPath = path.join(root, 'i18n/extracted/src/main.ts.json');
      const extracted = await readJson<ExtractedFile>(extractedPath);
      extracted.messages[0]!.translations['en-US'] = 'Home';
      await rebuild(watcher, observations, () =>
        writeJson(extractedPath, extracted),
      );

      expect(addFile).not.toHaveBeenCalled();
      expect(lastRegistration(observations, 'src/main.ts')).toContain(
        '"en-US":{"首页":"Home"}',
      );

      const localePath = path.join(root, 'i18n/locales/en-US.json');
      const locale = await readJson<LocaleFile>(localePath);
      locale.messages['首页'] = 'Start';
      await rebuild(watcher, observations, () => writeJson(localePath, locale));

      expect(addFile).not.toHaveBeenCalled();
      expect(lastRegistration(observations, 'src/main.ts')).toContain(
        '"en-US":{"首页":"Start"}',
      );
      expect(
        await readJson<CacheFile>(path.join(root, 'i18n/cache.json')),
      ).toMatchObject({
        messages: { 首页: { translations: { 'en-US': 'Start' } } },
      });
      expect(await readJson<ExtractedFile>(extractedPath)).toMatchObject({
        messages: [{ translations: { 'en-US': 'Start' } }],
      });
    } finally {
      addFile.mockRestore();
      await watcher.close();
    }
  });

  it('handles rename and removes modules that leave the reachable graph', async () => {
    const root = await fixtureRoot();
    const main = path.join(root, 'src/main.ts');
    const oldSource = path.join(root, 'src/old.ts');
    const newSource = path.join(root, 'src/new.ts');
    await write(root, 'src/main.ts', "import './old';");
    await write(root, 'src/old.ts', translatedModule('可移动文案'));
    const translator = translating({ 可移动文案: 'Moved text' });
    const observations: Observation[] = [];
    const watcher = await startWatch(root, translator, observations);

    try {
      await waitForBuild(watcher, observations, 0);
      expect(translator).toHaveBeenCalledTimes(1);

      await fs.copyFile(oldSource, newSource);
      await rebuild(watcher, observations, () =>
        fs.writeFile(main, "import './new';"),
      );
      expect(translator).toHaveBeenCalledTimes(1);
      expect(
        await readJson<ExtractedFile>(
          path.join(root, 'i18n/extracted/src/new.ts.json'),
        ),
      ).toMatchObject({
        messages: [{ translations: { 'en-US': 'Moved text' } }],
      });

      await rebuild(watcher, observations, () => fs.rm(oldSource));
      await expect(
        fs.access(path.join(root, 'i18n/extracted/src/old.ts.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });

      await rebuild(watcher, observations, () =>
        fs.writeFile(main, "console.log('done');"),
      );
      const cache = await readJson<CacheFile>(
        path.join(root, 'i18n/cache.json'),
      );
      const locale = await readJson<LocaleFile>(
        path.join(root, 'i18n/locales/en-US.json'),
      );
      expect(cache.files).toHaveProperty('src/new.ts');
      expect(cache.messages['可移动文案']?.translations['en-US']).toBe(
        'Moved text',
      );
      expect(locale.messages).not.toHaveProperty('可移动文案');
    } finally {
      await watcher.close();
    }
  });
});

interface WatcherEvent {
  code: string;
  error?: Error;
}

interface Watcher {
  on(event: 'event', listener: (event: WatcherEvent) => void): void;
  close(): Promise<void>;
}

interface Observation {
  registrations: Map<string, string>;
}

interface ExtractedFile {
  messages: Array<{ translations: Record<string, string | null> }>;
}

interface LocaleFile {
  messages: Record<string, string | null>;
}

interface CacheFile {
  files: Record<string, unknown>;
  messages: Record<string, { translations: Record<string, string | null> }>;
}

async function startWatch(
  root: string,
  translator: Translator | undefined,
  observations: Observation[],
): Promise<Watcher> {
  const observer = createObserver(observations);
  const result = await build({
    root,
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@ai-i18n/vite/runtime': runtimeEntry } },
    plugins: [
      aiI18n({
        sourceLang: 'zh-CN',
        defaultLang: 'en-US',
        locales,
        dts: false,
        ...(translator ? { translator } : {}),
        provider: { debounceMs: 60_000, strict: true },
      }),
      observer,
    ],
    build: {
      write: false,
      watch: {},
      lib: { entry: path.join(root, 'src/main.ts'), formats: ['es'] },
    },
  });
  return result as unknown as Watcher;
}

function createObserver(observations: Observation[]): Plugin {
  let registrations = new Map<string, string>();
  return {
    name: 'ai-i18n-watch-observer',
    buildStart() {
      registrations = new Map();
    },
    transform(code, id) {
      if (id.startsWith('\0virtual:ai-i18n/register?module=')) {
        registrations.set(decodeRegisterId(id), code);
      }
    },
    generateBundle() {
      observations.push({
        registrations: new Map(registrations),
      });
    },
  };
}

function translating(values: Record<string, string>): Translator {
  return vi.fn<Translator>(async (requests) =>
    requests.map((request) => ({
      messageId: request.messageId,
      locale: request.locale,
      value: values[request.source] ?? null,
    })),
  );
}

async function fixtureRoot(): Promise<string> {
  const created = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-build-watch-'),
  );
  const root = await fs.realpath(created);
  tempDirs.push(root);
  await fs.mkdir(path.join(root, 'src'));
  return root;
}

async function rebuild(
  watcher: Watcher,
  observations: Observation[],
  change: () => Promise<unknown>,
): Promise<void> {
  const complete = waitForBuild(watcher, observations, observations.length);
  await change();
  await complete;
}

function waitForBuild(
  watcher: Watcher,
  observations: Observation[],
  previousCount: number,
): Promise<void> {
  if (observations.length > previousCount) return Promise.resolve();
  return new Promise((resolve, reject) => {
    watcher.on('event', (event) => {
      if (event.code === 'ERROR') reject(event.error);
      if (event.code === 'END' && observations.length > previousCount) {
        resolve();
      }
    });
  });
}

function lastObservation(observations: Observation[]): Observation {
  return observations.at(-1)!;
}

function lastRegistration(
  observations: Observation[],
  moduleId: string,
): string {
  return lastObservation(observations).registrations.get(moduleId) ?? '';
}

function decodeRegisterId(id: string): string {
  const prefix = '\0virtual:ai-i18n/register?module=';
  return decodeURIComponent(id.slice(prefix.length));
}

async function protocolModifiedTimes(
  root: string,
): Promise<Record<string, bigint>> {
  const files = [
    'i18n/cache.json',
    'i18n/extracted/src/main.ts.json',
    'i18n/locales/zh-CN.json',
    'i18n/locales/en-US.json',
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        (await fs.stat(path.join(root, file), { bigint: true })).mtimeNs,
      ]),
    ),
  );
}

async function write(root: string, relative: string, content: string) {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

function translatedModule(source: string): string {
  return `import { t } from 'virtual:ai-i18n'; console.log(t(${JSON.stringify(source)}));`;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}
