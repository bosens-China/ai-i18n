import { describe, expect, it, vi } from 'vitest';
import {
  callHook,
  objectHandler,
  options,
  setupPlugin,
} from './plugin-test-utils';

describe('framework auto-import boundaries', () => {
  it.each([
    ['vanilla', [], 'tRef', '/workspace/src/main.ts'],
    ['vanilla', [], 'tComputed', '/workspace/src/main.ts'],
    [
      'react',
      [{ name: 'vite:react-babel' }],
      'tRef',
      '/workspace/src/main.tsx',
    ],
    [
      'react',
      [{ name: 'vite:react-babel' }],
      'tComputed',
      '/workspace/src/main.tsx',
    ],
  ] as const)(
    'does not extract Vue-only %s auto imports through %s',
    async (_framework, plugins, api, filename) => {
      const { transform } = setupPlugin(
        [],
        undefined,
        { ...options, autoImport: true },
        [...plugins],
      );

      await expect(
        transform(
          `const label = ${api}('不应跨框架提取'); console.log(label)`,
          filename,
        ),
      ).resolves.toBeNull();
    },
  );

  it.each(['tRef', 'tComputed'] as const)(
    'keeps the Vue %s auto import and extraction',
    async (api) => {
      const { transform } = setupPlugin(
        [],
        undefined,
        { ...options, autoImport: true },
        [{ name: 'vite:vue' }],
      );

      const result = await transform(
        `const label = ${api}('Vue 自动导入'); console.log(label)`,
        '/workspace/src/main.ts',
      );

      expect(result?.code).toContain(
        'import * as __aiI18nPrimaryRuntime from "virtual:ai-i18n/internal";',
      );
      expect(result?.code).toContain(
        `const ${api} = __aiI18nPrimaryScope.${api};`,
      );
      expect(result?.code).not.toContain('register?module=');
    },
  );

  it('preserves the React boundary during hot updates', async () => {
    const { plugin, transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true },
      [{ name: 'vite:react-babel' }],
    );
    const filename = '/workspace/src/hot.tsx';
    await transform("export const label = t('before')", filename);

    const registerId = '\0virtual:ai-i18n/register?module=src%2Fhot.tsx';
    const register = { id: registerId };
    const hotUpdate = objectHandler<
      (
        this: unknown,
        options: {
          type: 'update';
          file: string;
          timestamp: number;
          modules: unknown[];
          read: () => Promise<string>;
        },
      ) => Promise<unknown[] | undefined>
    >(plugin.hotUpdate);
    await hotUpdate.call(
      {
        environment: {
          name: 'client',
          moduleGraph: {
            getModuleById: (id: string) =>
              id === registerId ? register : undefined,
            invalidateModule: vi.fn(),
          },
        },
      },
      {
        type: 'update',
        file: filename,
        timestamp: 2,
        modules: [],
        read: async () =>
          "export const label = tComputed('不应在 React HMR 中提取')",
      },
    );

    const registration = await callHook<Promise<string>>(
      plugin.load,
      registerId,
    );
    expect(registration).not.toContain('before');
    expect(registration).not.toContain('不应在 React HMR 中提取');
  });
});
