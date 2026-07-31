import { describe, expect, it } from 'vitest';
import {
  callHook,
  objectHandler,
  options,
  setupPlugin,
} from './plugin-test-utils';

describe('@ai-i18n/vite framework transforms', () => {
  it('auto-imports the Vanilla runtime without changing local bindings', async () => {
    const { transform } = setupPlugin([], undefined, {
      ...options,
      autoImport: true,
    });
    const result = await transform(
      "t('自动导入'); setLang('en-US')",
      '/workspace/src/main.ts',
    );

    expect(result?.code).toContain(
      'import { t, setLang } from "virtual:ai-i18n";',
    );
    expect(result?.code).toContain('register?module=src%2Fmain.ts');
  });

  it.each([
    ['vue', { name: 'vite:vue' }],
    ['react', { name: 'vite:react-babel' }],
  ] as const)(
    'auto-imports Runtime value references in %s mode',
    async (_framework, hostPlugin) => {
      const { transform } = setupPlugin(
        [],
        undefined,
        { ...options, autoImport: true },
        [hostPlugin],
      );
      const result = await transform(
        'const switchLanguage = setLang; const runtime = { getLang }',
        '/workspace/src/runtime.ts',
      );

      expect(result?.code).toContain(
        'import { setLang, getLang } from "virtual:ai-i18n";',
      );
    },
  );

  it('keeps auto import disabled when it is not explicitly configured', async () => {
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'host-plugin' },
    ]);
    await expect(
      transform("t('需要显式导入')", '/workspace/src/main.ts'),
    ).resolves.toBeNull();
  });

  it('enables auto import only when explicitly configured', async () => {
    const enabled = setupPlugin([], undefined, {
      ...options,
      autoImport: true,
    });
    expect(
      await enabled.transform("t('显式开启')", '/workspace/src/enabled.ts'),
    ).not.toBeNull();

    const disabled = setupPlugin([], undefined, {
      ...options,
      autoImport: false,
    });
    await expect(
      disabled.transform("t('显式关闭')", '/workspace/src/disabled.ts'),
    ).resolves.toBeNull();
  });

  it('does not treat JSX as Vanilla source', async () => {
    const { transform } = setupPlugin();
    await expect(
      transform(
        "export const view = <p>{t('JSX 文案')}</p>",
        '/workspace/src/View.jsx',
      ),
    ).resolves.toBeNull();
  });

  it('detects Vue JSX and auto-imports its Hook', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true, loading: {} },
      [{ name: 'vite:vue' }, { name: 'vite:vue-jsx' }],
    );
    const vue = await transform(
      `const { t: hookT } = useI18n()
export const label = t('Vue TS')
export const View = () => <p>{hookT('Vue JSX')}</p>`,
      '/workspace/src/View.tsx',
    );

    expect(vue?.code).toContain(
      'import { useI18n, t } from "virtual:ai-i18n";',
    );
    expect(vue?.code).toContain('register?module=src%2FView.tsx');
  });

  it('keeps the explicit Hook import when auto import is disabled', async () => {
    const { transform } = setupPlugin([], undefined, options, [
      { name: 'vite:vue' },
    ]);
    const vue = await transform(
      `import { useI18n } from 'virtual:ai-i18n'
const { t } = useI18n()
export const label = t('显式 Hook')`,
      '/workspace/src/useLabel.ts',
    );

    expect(vue?.code).toContain("import { useI18n } from 'virtual:ai-i18n'");
    expect(vue?.code).not.toContain(
      'import { useI18n } from "virtual:ai-i18n";',
    );
    expect(vue?.code).toContain('register?module=src%2FuseLabel.ts');
  });

  it('detects React JSX and auto-imports its Hook', async () => {
    const { transform } = setupPlugin(
      [],
      undefined,
      { ...options, autoImport: true, loading: {} },
      [{ name: 'vite:react-babel' }],
    );
    const react = await transform(
      `const { t: hookT } = useI18n()
export const label = t('React TS')
export const View = () => <p>{hookT('React JSX')}</p>`,
      '/workspace/src/View.tsx',
    );

    expect(react?.code).toContain(
      'import { useI18n, t } from "virtual:ai-i18n";',
    );
    expect(react?.code).toContain('register?module=src%2FView.tsx');
  });

  it('reports dynamic arguments with source locations', async () => {
    const warnings: unknown[] = [];
    const { transform } = setupPlugin(warnings, undefined, {
      ...options,
      autoImport: true,
    });
    const result = await transform(
      't(props.label)',
      '/workspace/src/dynamic.ts',
    );
    expect(result?.code).toContain('import { t } from "virtual:ai-i18n";');
    expect(warnings).toMatchObject([
      { id: '/workspace/src/dynamic.ts', loc: { line: 1, column: 0 } },
    ]);
  });

  it('returns a stateless stub and skips transforms for SSR', async () => {
    const warnings: unknown[] = [];
    const { plugin, transform } = setupPlugin(warnings);
    await expect(
      transform(
        "import { t } from 'virtual:ai-i18n'; t('服务端')",
        '/workspace/src/ssr.ts',
        { ssr: true },
      ),
    ).resolves.toBeNull();
    await expect(
      transform(
        "const messages = defineI18nMessages({ save: '保存' })",
        '/workspace/src/ssr-messages.ts',
        { ssr: true },
      ),
    ).resolves.toMatchObject({
      code: "const messages = ({ save: '保存' })",
    });

    const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
    const load = objectHandler<
      (this: unknown, id: string, options: { ssr: boolean }) => Promise<string>
    >(plugin.load);
    const stub = await load.call(
      {
        environment: { name: 'ssr' },
        warn: (value: unknown) => warnings.push(value),
      },
      runtimeId,
      { ssr: true },
    );

    expect(stub).toContain('const runtimeT = (source, ...values)');
    expect(stub).toContain('export const t = runtimeT');
    expect(stub).toContain('export const getLangLoadState');
    expect(stub).not.toContain('createI18nRuntime');
    expect(warnings).toHaveLength(1);
  });

  it('uses framework adapters for SSR Hook stub shapes', async () => {
    for (const item of [
      {
        adapter: 'createVueI18nAdapter',
        hook: 'export const { t, useI18n, tRef, i18nComputed, tComputed } = createVueI18nAdapter(runtime)',
        frameworkPlugin: { name: 'vite:vue' },
        module: '@ai-i18n/vite/vue',
      },
      {
        adapter: 'createReactI18n',
        hook: 'export const useI18n = createReactI18n(runtime)',
        frameworkPlugin: { name: 'vite:react-babel' },
        module: '@ai-i18n/vite/react',
      },
    ]) {
      const { plugin } = setupPlugin([], undefined, options, [
        item.frameworkPlugin,
      ]);
      const runtimeId = callHook<string>(plugin.resolveId, 'virtual:ai-i18n');
      const load = objectHandler<
        (
          this: unknown,
          id: string,
          options: { ssr: boolean },
        ) => Promise<string>
      >(plugin.load);
      const stub = await load.call(
        { environment: { name: 'ssr' }, warn: () => {} },
        runtimeId,
        { ssr: true },
      );

      expect(stub).toContain(
        `import { ${item.adapter} } from '${item.module}'`,
      );
      expect(stub).toContain(item.hook);
    }
  });
});
