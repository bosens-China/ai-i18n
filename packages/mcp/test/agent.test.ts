import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { callTranslationTool } from '../src/agent';
import { cleanupFixtures, fixture, readFixtureMemory } from './project-fixture';

afterEach(cleanupFixtures);

it('lets Skill-only translation reuse MCP validation and persistence', async () => {
  const directory = path.join(await fixture(), 'apps/web/i18n');
  const list = () =>
    callTranslationTool({
      name: 'ai_i18n_list_translations',
      arguments: { i18n_directory: directory },
    });
  expect((await list()).isError).not.toBe(true);
  const update = {
    name: 'ai_i18n_set_translations',
    arguments: {
      i18n_directory: directory,
      default_locale: 'en-US',
      updates: [{ message: { source: '保存' }, value: 'Save' }],
    },
  };
  expect((await callTranslationTool(update)).isError).not.toBe(true);
  expect(
    (await readFixtureMemory(directory)).messages['保存']?.translations[
      'en-US'
    ],
  ).toBe('Save');
  expect(
    (
      await callTranslationTool({
        ...update,
        arguments: {
          ...update.arguments,
          updates: [{ message: { source: '保存' }, value: 'Save {name}' }],
        },
      })
    ).isError,
  ).toBe(true);
  expect(
    (await readFixtureMemory(directory)).messages['保存']?.translations[
      'en-US'
    ],
  ).toBe('Save');
  await expect(
    callTranslationTool({
      name: 'ai_i18n_delete_orphan_messages',
      arguments: {},
    }),
  ).rejects.toThrow();
  expect((await list()).isError).not.toBe(true);
});

it('returns duplicate key locations instead of hiding the conflict in a generic MCP error', async () => {
  const directory = path.join(await fixture(), 'apps/web/i18n');
  for (const relative of ['extracted/src_home.ts.json', 'translations/en-US']) {
    const target = path.join(directory, relative);
    const file = relative.endsWith('.json')
      ? target
      : path.join(target, (await fs.readdir(target))[0]!);
    const original = await fs.readFile(file, 'utf8');
    const raw = original.replace(
      /"version"\s*:\s*1/,
      '"version":1,"version":2',
    );
    await fs.writeFile(file, raw);
    const result = await callTranslationTool({
      name: 'ai_i18n_list_translations',
      arguments: { i18n_directory: directory },
    });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0]!.text)).toMatchObject({
      error_code: 'DUPLICATE_JSON_KEY',
      file,
      json_pointer: '/version',
      first: { line: expect.any(Number) },
      duplicate: { line: expect.any(Number) },
    });
    expect(await fs.readFile(file, 'utf8')).toBe(raw);
    await fs.writeFile(file, original);
  }
});
