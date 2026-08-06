import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Translator } from '@ai-i18n/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { build, type Plugin } from 'vite';
import { aiI18n, Analyzer } from '../src';
import { extractedTestPath } from './extracted-test-path';
import {
  readProtocolJson as readJson,
  translationShardFiles,
  writeProtocolJson as writeJson,
} from './translation-memory-test-utils';

const tempDirs: string[] = [];
const runtimeEntry = path.resolve('packages/vite/src/runtime.ts');
const watchIdleMs = 100;
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

describe('Vite build watch', { timeout: 10_000 }, () => {
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
      await waitForBuild(watcher, 0);
      expect(lastRegistration(observations, 'src/main.ts')).toContain(
        '"en-US":{"首页":"Home"}',
      );
      expect(translator).toHaveBeenCalledTimes(1);
      addFile.mockClear();

      await rebuild(watcher, () =>
        fs.writeFile(main, mainCode.replace('console.log', 'console.info')),
      );
      expect(addFile.mock.calls.map(([moduleId]) => moduleId)).toEqual([
        'src/main.ts',
      ]);
      expect(translator).toHaveBeenCalledTimes(1);
      addFile.mockClear();

      const nextTexts = "export const LABEL = '设置';";
      await rebuild(watcher, () => fs.writeFile(texts, nextTexts));
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
      await rebuild(watcher, () => fs.writeFile(texts, nextTexts));
      expect(await protocolModifiedTimes(root)).toEqual(before);
      expect(lastRegistration(observations, 'src/main.ts')).toBe(registration);
      expect(addFile).not.toHaveBeenCalled();
      expect(translator).toHaveBeenCalledTimes(2);
    } finally {
      addFile.mockRestore();
      await watcher.close();
    }
  });

  it('reconciles memory edits and restores derived files without parsing source again', async () => {
    const root = await fixtureRoot();
    await write(root, 'src/main.ts', translatedModule('首页'));
    const observations: Observation[] = [];
    const addFile = vi.spyOn(Analyzer.prototype, 'addFile');
    const watcher = await startWatch(root, undefined, observations);

    try {
      await waitForBuild(watcher, 0);
      addFile.mockClear();
      const extractedPath = extractedTestPath(root, 'src/main.ts');
      const memoryPath = path.join(root, 'i18n/translations.json');
      const localePath = path.join(root, 'i18n/locales/en-US.json');
      const locale = await readJson<LocaleFile>(localePath);
      locale.messages['首页'] = 'Start';
      await rebuild(watcher, () => writeJson(localePath, locale));
      expect(await readJson<LocaleFile>(localePath)).toMatchObject({
        messages: { 首页: null },
      });

      const memory = await readJson<CacheFile>(memoryPath);
      memory.messages['首页']!.translations['en-US'] = 'Home';
      await rebuild(watcher, () => writeJson(memoryPath, memory));

      expect(addFile).not.toHaveBeenCalled();
      expect(lastRegistration(observations, 'src/main.ts')).toContain(
        '"en-US":{"首页":"Home"}',
      );
      expect(await readJson<CacheFile>(memoryPath)).toMatchObject({
        messages: { 首页: { translations: { 'en-US': 'Home' } } },
      });
      expect(await readJson<LocaleFile>(localePath)).toMatchObject({
        messages: { 首页: 'Home' },
      });
      expect(JSON.stringify(await readJson(extractedPath))).not.toContain(
        'translations',
      );
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
      await waitForBuild(watcher, 0);
      expect(translator).toHaveBeenCalledTimes(1);

      await fs.copyFile(oldSource, newSource);
      await rebuild(watcher, () => fs.writeFile(main, "import './new';"));
      expect(translator).toHaveBeenCalledTimes(1);
      expect(
        await readJson<ExtractedFile>(extractedTestPath(root, 'src/new.ts')),
      ).toMatchObject({
        messages: [{ id: '可移动文案' }],
      });

      await rebuild(watcher, () => fs.rm(oldSource));
      await expect(
        fs.access(extractedTestPath(root, 'src/old.ts')),
      ).rejects.toMatchObject({ code: 'ENOENT' });

      await rebuild(watcher, () => fs.writeFile(main, "console.log('done');"));
      const cache = await readJson<CacheFile>(
        path.join(root, 'i18n/translations.json'),
      );
      const locale = await readJson<LocaleFile>(
        path.join(root, 'i18n/locales/en-US.json'),
      );
      expect(cache).not.toHaveProperty('files');
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
  building: boolean;
  completedBuilds: number;
  lastEventAt: number;
  lastError?: Error;
  on(event: 'event', listener: (event: WatcherEvent) => void): void;
  close(): Promise<void>;
}

interface Observation {
  registrations: Map<string, string>;
}

interface ExtractedFile {
  messages: Array<{ id: string }>;
}

interface LocaleFile {
  messages: Record<string, string | null>;
}

interface CacheFile {
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
        ...(translator
          ? {
              provider: {
                translator,
                debounceMs: 60_000,
                strict: true,
              },
            }
          : {}),
      }),
      observer,
    ],
    build: {
      write: false,
      watch: {},
      lib: { entry: path.join(root, 'src/main.ts'), formats: ['es'] },
    },
  });
  const watcher = result as unknown as Watcher;
  watcher.building = true;
  watcher.completedBuilds = 0;
  watcher.lastEventAt = Date.now();
  // 文件写入可能先产生瞬时 ERROR；后续 END 才表示一次有效构建完成。
  watcher.on('event', (event) => {
    watcher.lastEventAt = Date.now();
    if (event.code === 'START') {
      watcher.building = true;
    }
    if (event.code === 'ERROR') {
      watcher.lastError =
        event.error ?? new Error('Vite watch build failed without an error.');
    }
    if (event.code === 'END') {
      watcher.building = false;
      watcher.completedBuilds += 1;
    }
  });
  return watcher;
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
  return vi.fn<Translator>(async ({ locales, messages }) =>
    messages.map((message) =>
      Object.fromEntries(
        locales.map((locale) => [locale, values[message.source] ?? null]),
      ),
    ),
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
  change: () => Promise<unknown>,
): Promise<void> {
  // 前一轮构建写出的协议文件也会触发 watch，先等其收敛再执行本次修改。
  await waitForIdle(watcher);
  const previousCount = watcher.completedBuilds;
  watcher.lastError = undefined;
  await change();
  await waitForBuild(watcher, previousCount);
  await waitForIdle(watcher);
}

async function waitForBuild(
  watcher: Watcher,
  previousCount: number,
): Promise<void> {
  await vi.waitFor(
    () => {
      if (watcher.completedBuilds > previousCount) return;
      if (watcher.lastError) throw watcher.lastError;
      throw new Error('Timed out waiting for the Vite watch build.');
    },
    { timeout: 5_000, interval: 20 },
  );
}

async function waitForIdle(watcher: Watcher): Promise<void> {
  // 插件写出的协议文件也会触发 watch；等待事件流静默，避免下一次修改与旧 rebuild 重叠。
  await vi.waitFor(
    () => {
      if (
        !watcher.building &&
        Date.now() - watcher.lastEventAt >= watchIdleMs
      ) {
        return;
      }
      throw new Error('Timed out waiting for the Vite watcher to become idle.');
    },
    { timeout: 5_000, interval: 20 },
  );
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
    path.join(root, 'i18n/storage.json'),
    ...(await translationShardFiles(root)),
    extractedTestPath(root, 'src/main.ts'),
    path.join(root, 'i18n/locales/en-US.json'),
  ];
  return Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        (await fs.stat(file, { bigint: true })).mtimeNs,
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
