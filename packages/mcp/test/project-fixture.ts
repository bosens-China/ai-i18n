import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openTranslationMemoryStore } from '@ai-i18n/core/translation-memory';
import { closeProjectMemoryStores } from '../src/project-files';

const tempDirectories: string[] = [];

export async function cleanupFixtures(): Promise<void> {
  await closeProjectMemoryStores();
  await Promise.all(
    tempDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
}

export async function fixture(
  storage: 'json' | 'sqlite' = 'json',
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-i18n-mcp-'));
  tempDirectories.push(root);
  const directory = path.join(root, 'apps/web/i18n');
  await fs.mkdir(path.join(directory, 'extracted'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'translations.json'),
    JSON.stringify({
      version: 1,
      revision: 0,
      messages: {
        保存: {
          source: '保存',
          sourceLang: 'zh-CN',
          translations: { 'en-US': null, 'ja-JP': '保存する' },
        },
        退出: {
          source: '退出',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Exit', 'ja-JP': null },
        },
      },
    }),
  );
  if (storage === 'sqlite') {
    const store = await openTranslationMemoryStore({ directory, storage });
    store.close();
  }
  await fs.writeFile(
    path.join(directory, 'overrides.json'),
    JSON.stringify({ version: 1, messages: {} }),
  );
  await fs.writeFile(
    path.join(directory, 'extracted/src_home.ts.json'),
    JSON.stringify({
      version: 1,
      source: 'src/home.ts',
      messages: [
        {
          id: '保存',
          source: '保存',
          locations: [{ line: 1, column: 0 }],
        },
        {
          id: '退出',
          source: '退出',
          locations: [{ line: 2, column: 0 }],
        },
      ],
    }),
  );
  return root;
}

export interface MemoryDocument {
  messages: Record<string, { translations: Record<string, string | null> }>;
}

export async function readFixtureMemory(
  directory: string,
): Promise<MemoryDocument> {
  const store = await openTranslationMemoryStore({ directory });
  try {
    return (await store.load()) as MemoryDocument;
  } finally {
    store.close();
  }
}

export async function readFixtureOverrides(
  directory: string,
): Promise<unknown> {
  return JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  ) as unknown;
}

export async function addFixtureMessage(
  directory: string,
  message: { id: string; source: string; comment?: string },
): Promise<void> {
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    ...message,
    locations: [{ line: extracted.messages.length + 1, column: 0 }],
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));

  await updateMemory(directory, (messages) => {
    messages[message.id] = {
      source: message.source,
      sourceLang: 'zh-CN',
      ...(message.comment ? { comment: message.comment } : {}),
      translations: { 'en-US': null, 'ja-JP': null },
    };
  });
}

export async function addFixtureOrphanMessage(
  directory: string,
  message: {
    id: string;
    source: string;
    comment?: string;
    translations?: Record<string, string | null>;
  },
): Promise<void> {
  await updateMemory(directory, (messages) => {
    messages[message.id] = {
      source: message.source,
      sourceLang: 'zh-CN',
      ...(message.comment ? { comment: message.comment } : {}),
      translations: message.translations ?? {
        'en-US': null,
        'ja-JP': null,
      },
    };
  });
}

export async function addFixtureSourceFile(
  directory: string,
  sourceFile: string,
  message: { id: string; source: string; comment?: string },
): Promise<void> {
  await fs.writeFile(
    path.join(
      directory,
      'extracted',
      `extra-${Buffer.from(sourceFile).toString('base64url')}.json`,
    ),
    JSON.stringify({
      version: 1,
      source: sourceFile,
      messages: [{ ...message, locations: [{ line: 1, column: 0 }] }],
    }),
  );

  await updateMemory(directory, (messages) => {
    messages[message.id] = {
      source: message.source,
      sourceLang: 'zh-CN',
      ...(message.comment ? { comment: message.comment } : {}),
      translations: { 'en-US': null, 'ja-JP': null },
    };
  });
}

async function updateMemory(
  directory: string,
  update: (messages: Record<string, unknown>) => void,
): Promise<void> {
  const store = await openTranslationMemoryStore({ directory });
  try {
    await store.transact((memory) => update(memory.messages));
  } finally {
    store.close();
  }
}
