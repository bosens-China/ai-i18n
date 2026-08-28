import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicOverrides } from '../src/index';
import {
  readTranslationOverrides,
  transactTranslationOverrides,
  translationOverrideFiles,
} from '../src/translation-memory';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('translation override JSON buckets', () => {
  it('groups override targets by locale and hash bucket', async () => {
    const directory = await temporaryDirectory();
    await transactTranslationOverrides(directory, (overrides) => {
      overrides.rules.push(
        { source: '取消', translations: { 'en-US': 'Cancel' } },
        { source: '提交', translations: { 'en-US': 'Submit' } },
      );
    });

    const files = await translationOverrideFiles(directory);
    expect(files).toEqual([path.join(directory, 'en-US/f.json')]);
    const bucket = JSON.parse(await fs.readFile(files[0]!, 'utf8')) as {
      entries: Record<string, unknown>;
    };
    expect(Object.keys(bucket.entries)).toHaveLength(2);
    expect(
      atomicOverrides(await readTranslationOverrides(directory)).size,
    ).toBe(2);
  });

  it('deletes an empty override bucket', async () => {
    const directory = await temporaryDirectory();
    await transactTranslationOverrides(directory, (overrides) => {
      overrides.rules.push({
        source: '保存',
        translations: { 'en-US': 'Save' },
      });
    });

    await transactTranslationOverrides(directory, (overrides) => {
      overrides.rules = [];
    });

    expect(await translationOverrideFiles(directory)).toEqual([]);
    expect(await readTranslationOverrides(directory)).toEqual({
      version: 2,
      rules: [],
    });
  });

  it('rejects an override entry moved into the wrong bucket', async () => {
    const directory = await temporaryDirectory();
    await transactTranslationOverrides(directory, (overrides) => {
      overrides.rules.push({
        source: '保存',
        translations: { 'en-US': 'Save' },
      });
    });
    const file = (await translationOverrideFiles(directory))[0]!;
    await fs.rename(file, path.join(path.dirname(file), '0.json'));

    await expect(readTranslationOverrides(directory)).rejects.toThrow();
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'ai-i18n-override-store-'),
  );
  tempDirectories.push(directory);
  return directory;
}
