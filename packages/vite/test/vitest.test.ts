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

function callHook<T>(hook: Plugin[keyof Plugin], ...args: unknown[]): T {
  const handler =
    typeof hook === 'function'
      ? hook
      : (hook as { handler: (...values: unknown[]) => T }).handler;
  return handler.apply({}, args) as T;
}
