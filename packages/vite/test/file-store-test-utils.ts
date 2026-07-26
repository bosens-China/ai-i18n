import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { FileStore } from '../src/file-store';
import {
  ProjectState,
  type NormalizedAiI18nOptions,
} from '../src/project-state';

const tempDirs: string[] = [];

export const options: NormalizedAiI18nOptions = {
  sourceLang: 'zh-CN',
  defaultLang: 'en-US',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

export async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-files-'));
  tempDirs.push(root);
  await fs.mkdir(path.join(root, 'src'));
  return {
    root,
    state: new ProjectState(root, options),
    store: new FileStore({
      root,
      sourceLang: options.sourceLang,
      locales: options.locales,
    }),
  };
}

export async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
}
