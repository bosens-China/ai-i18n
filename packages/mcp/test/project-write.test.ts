import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { AiI18nProjectService } from '../src/project';
import { cleanupFixtures, fixture } from './project-fixture';

afterEach(cleanupFixtures);

test('fills null values atomically and refuses conflicting overwrites', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();
  const extractedPath = path.join(
    root,
    'apps/web/i18n/extracted/src_home.ts.json',
  );

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        { message_id: '退出', locale: 'en-US', value: 'Leave' },
      ],
    }),
  ).rejects.toThrow('refusing to overwrite');
  const unchanged = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  expect(unchanged.messages[0]).not.toHaveProperty('translations');

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        { message_id: '退出', locale: 'ja-JP', value: '' },
      ],
    }),
  ).resolves.toEqual({
    file: 'src/home.ts',
    applied_count: 2,
    unchanged_count: 0,
  });

  const memory = JSON.parse(
    await fs.readFile(path.join(directory, 'translations.json'), 'utf8'),
  ) as {
    revision: number;
    messages: Record<string, { translations: Record<string, string | null> }>;
  };
  expect(memory.revision).toBe(1);
  expect(memory.messages['保存']?.translations['en-US']).toBe('Save');
  expect(memory.messages['退出']?.translations['ja-JP']).toBe('');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  expect(extracted.messages[0]).not.toHaveProperty('translations');

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        { message_id: '退出', locale: 'ja-JP', value: '' },
      ],
    }),
  ).resolves.toEqual({
    file: 'src/home.ts',
    applied_count: 0,
    unchanged_count: 2,
  });

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'ja-JP', value: 'セーブ' }],
    }),
  ).rejects.toThrow('refusing to overwrite');
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'fr-FR', value: 'Sauvegarder' },
      ],
    }),
  ).rejects.toThrow('unknown locale "fr-FR"');
});

test('reports a missing message id and points to the list tool', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');

  await expect(
    new AiI18nProjectService().writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '不存在', locale: 'en-US', value: 'Missing' },
      ],
    }),
  ).rejects.toThrowError(
    new Error(
      '[ai-i18n/mcp] message "不存在" does not exist in "src/home.ts"; call ai_i18n_list_translations for this file and use the returned message_id',
    ),
  );
});

test('writes human review to overrides without replacing AI memory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const service = new AiI18nProjectService();

  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    translations: [{ message_id: '保存', locale: 'en-US', value: 'Save' }],
  });
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
    }),
  ).rejects.toThrow('refusing to overwrite');
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
    }),
  ).resolves.toMatchObject({ applied_count: 1 });

  const memory = JSON.parse(
    await fs.readFile(path.join(directory, 'translations.json'), 'utf8'),
  );
  expect(memory.messages['保存'].translations['en-US']).toBe('Save');
  const overrides = JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  );
  expect(overrides.messages['保存'].default['en-US']).toBe('Keep');
});

test('resolves default and comment-specific reviews before AI memory', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: '保存#工具栏按钮',
    source: '保存',
    comment: '工具栏按钮',
    locations: [{ line: 3, column: 0 }],
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));
  const memoryPath = path.join(directory, 'translations.json');
  const memory = JSON.parse(await fs.readFile(memoryPath, 'utf8'));
  memory.messages['保存#工具栏按钮'] = {
    source: '保存',
    sourceLang: 'zh-CN',
    comment: '工具栏按钮',
    translations: { 'en-US': null, 'ja-JP': null },
  };
  await fs.writeFile(memoryPath, JSON.stringify(memory));
  const service = new AiI18nProjectService();

  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    translations: [
      {
        message_id: '保存#工具栏按钮',
        locale: 'en-US',
        value: 'Save action',
      },
    ],
  });
  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    mode: 'review',
    translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
  });
  await service.writeTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    mode: 'review',
    review_scope: 'message',
    translations: [
      { message_id: '保存#工具栏按钮', locale: 'en-US', value: '' },
    ],
  });

  const listed = await service.listTranslations({
    i18n_directory: directory,
    file: 'src/home.ts',
    missing_only: false,
    limit: 100,
  });
  expect(
    listed.items.find((message) => message.message_id === '保存')?.translations[
      'en-US'
    ],
  ).toBe('Keep');
  const scoped = listed.items.find(
    (message) => message.message_id === '保存#工具栏按钮',
  );
  expect(scoped).toMatchObject({
    source: '保存',
    translations: { 'en-US': '' },
  });
  expect(scoped?.missing_locales).not.toContain('en-US');

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存#工具栏按钮', locale: 'en-US', value: 'Save' },
      ],
    }),
  ).rejects.toThrow('refusing to overwrite');
  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      review_scope: 'message',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Save' }],
    }),
  ).rejects.toThrow('requires a message with comment');

  const overrides = JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  );
  expect(overrides.messages['保存']).toMatchObject({
    default: { 'en-US': 'Keep' },
    byId: { '保存#工具栏按钮': { 'en-US': '' } },
  });
  expect(
    JSON.parse(await fs.readFile(memoryPath, 'utf8')).messages[
      '保存#工具栏按钮'
    ].translations['en-US'],
  ).toBe('Save action');
});

test('preserves template tokens before writing a translation batch', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const extractedPath = path.join(directory, 'extracted/src_home.ts.json');
  const memoryPath = path.join(directory, 'translations.json');
  const messageId = '语法 {{=0}}，当前 {{0}}';
  const memory = JSON.parse(await fs.readFile(memoryPath, 'utf8')) as {
    messages: Record<string, unknown>;
  };
  memory.messages[messageId] = {
    source: messageId,
    sourceLang: 'zh-CN',
    translations: { 'en-US': null, 'ja-JP': null },
  };
  await fs.writeFile(memoryPath, JSON.stringify(memory));
  const extracted = JSON.parse(await fs.readFile(extractedPath, 'utf8')) as {
    messages: Array<Record<string, unknown>>;
  };
  extracted.messages.push({
    id: messageId,
    source: messageId,
    locations: [{ line: 3, column: 0 }],
  });
  await fs.writeFile(extractedPath, JSON.stringify(extracted));
  const service = new AiI18nProjectService();

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        { message_id: '保存', locale: 'en-US', value: 'Save' },
        {
          message_id: messageId,
          locale: 'en-US',
          value: 'Syntax {{0}}; current {{0}}',
        },
      ],
    }),
  ).rejects.toThrow('changed template tokens');
  expect(
    JSON.parse(await fs.readFile(memoryPath, 'utf8')).messages['保存']
      .translations['en-US'],
  ).toBeNull();

  await expect(
    service.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [
        {
          message_id: messageId,
          locale: 'en-US',
          value: 'Current {{0}}; syntax {{=0}}',
        },
      ],
    }),
  ).resolves.toMatchObject({ applied_count: 1 });
});

test('serializes concurrent translation-memory updates from separate services', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const first = new AiI18nProjectService();
  const second = new AiI18nProjectService();

  await Promise.all([
    first.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Save' }],
    }),
    second.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      translations: [{ message_id: '退出', locale: 'ja-JP', value: '' }],
    }),
  ]);

  const memory = JSON.parse(
    await fs.readFile(path.join(directory, 'translations.json'), 'utf8'),
  ) as {
    messages: Record<string, { translations: Record<string, string | null> }>;
  };
  expect(memory.messages['保存']?.translations['en-US']).toBe('Save');
  expect(memory.messages['退出']?.translations['ja-JP']).toBe('');
});

test('serializes concurrent human reviews from separate services', async () => {
  const root = await fixture();
  const directory = path.join(root, 'apps/web/i18n');
  const first = new AiI18nProjectService();
  const second = new AiI18nProjectService();

  await Promise.all([
    first.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      translations: [{ message_id: '保存', locale: 'en-US', value: 'Keep' }],
    }),
    second.writeTranslations({
      i18n_directory: directory,
      file: 'src/home.ts',
      mode: 'review',
      translations: [{ message_id: '退出', locale: 'ja-JP', value: '' }],
    }),
  ]);

  const overrides = JSON.parse(
    await fs.readFile(path.join(directory, 'overrides.json'), 'utf8'),
  );
  expect(overrides.messages['保存']?.default['en-US']).toBe('Keep');
  expect(overrides.messages['退出']?.default['ja-JP']).toBe('');
});
