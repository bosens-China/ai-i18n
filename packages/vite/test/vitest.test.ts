import type { Plugin, ResolvedConfig } from 'vite';
import { expect, test } from 'vitest';
import { aiI18nVitest } from '../src/vitest';

test('Vitest plugin resolves a stateless React-compatible virtual runtime', () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [
      { value: 'zh-CN', label: '中文' },
      { value: 'en-US', label: 'English' },
    ],
  });
  callHook<void>(plugin.configResolved, {
    plugins: [plugin, { name: 'vite:react-babel' }],
  } as unknown as ResolvedConfig);
  const id = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
  const code = callHook<string>(plugin.load, id);

  expect(id).toBe('\0virtual:ai-i18n:vitest');
  expect(code).toContain("from '@ai-i18n/vite/react'");
  expect(code).toContain('export const useI18n = createReactI18n(runtime)');
  expect(code).not.toContain('FileStore');
});

test('Vitest plugin erases defineI18nMessages without a runtime import', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
  });
  callHook<void>(plugin.configResolved, {
    plugins: [plugin],
  } as unknown as ResolvedConfig);

  const result = await callHook<Promise<{ code: string; map: unknown } | null>>(
    plugin.transform,
    "const messages = defineI18nMessages({ save: '保存' })",
    '/workspace/src/messages.ts',
  );

  expect(result?.code).toBe("const messages = ({ save: '保存' })");
});

test('Vitest plugin rejects using defineI18nMessages as a runtime value', async () => {
  const plugin = aiI18nVitest({
    sourceLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
  });
  callHook<void>(plugin.configResolved, {
    plugins: [plugin],
  } as unknown as ResolvedConfig);

  await expect(
    callHook<Promise<unknown>>(
      plugin.transform,
      'const macro = defineI18nMessages',
      '/workspace/src/invalid-macro.ts',
    ),
  ).rejects.toThrow('must be called directly');
});

function callHook<T>(hook: Plugin[keyof Plugin], ...args: unknown[]): T {
  const handler =
    typeof hook === 'function'
      ? hook
      : (hook as { handler: (...values: unknown[]) => T }).handler;
  return handler.apply({}, args) as T;
}
