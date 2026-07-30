import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';
import { describe, expect, it } from 'vitest';
import plugin, {
  noEagerTranslation,
  noRedundantAutoImport,
  noUnsubscribedRuntimeState,
  noUnsubscribedT,
  staticCandidateLimit,
  tStaticArgs,
} from '../src/index';

describe('@ai-i18n/eslint config', () => {
  it('separates explicit-import and auto-import presets', () => {
    expect(plugin.rules).toHaveProperty(
      'no-eager-translation',
      noEagerTranslation,
    );
    expect(plugin.rules).toHaveProperty(
      'no-redundant-auto-import',
      noRedundantAutoImport,
    );
    expect(plugin.rules).toHaveProperty(
      'no-unsubscribed-runtime-state',
      noUnsubscribedRuntimeState,
    );
    expect(plugin.rules).toHaveProperty('no-unsubscribed-t', noUnsubscribedT);
    expect(plugin.rules).toHaveProperty('t-static-args', tStaticArgs);
    expect(plugin.rules).toHaveProperty(
      'static-candidate-limit',
      staticCandidateLimit,
    );
    expect(plugin.configs?.recommended).toEqual([
      expect.objectContaining({
        ignores: ['**/*.vue'],
        rules: {
          'ai-i18n/no-eager-translation': 'warn',
          'ai-i18n/no-unsubscribed-runtime-state': 'warn',
          'ai-i18n/no-unsubscribed-t': 'warn',
          'ai-i18n/static-candidate-limit': 'warn',
          'ai-i18n/t-static-args': 'error',
        },
      }),
    ]);
    expect(plugin.configs?.vue).toEqual([
      expect.objectContaining({
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx,vue}'],
        languageOptions: {
          globals: { defineI18nMessages: 'readonly' },
        },
        rules: {
          'ai-i18n/no-eager-translation': 'warn',
          'ai-i18n/no-unsubscribed-runtime-state': 'warn',
          'ai-i18n/no-unsubscribed-t': 'warn',
          'ai-i18n/static-candidate-limit': 'warn',
          'ai-i18n/t-static-args': 'error',
        },
      }),
    ]);
    expect(plugin.configs?.['react-auto-import']).toEqual([
      expect.objectContaining({
        languageOptions: {
          globals: {
            t: 'readonly',
            setLang: 'readonly',
            getLang: 'readonly',
            getLangs: 'readonly',
            getLangLoadState: 'readonly',
            subscribe: 'readonly',
            useI18n: 'readonly',
            defineI18nMessages: 'readonly',
          },
        },
        rules: {
          'ai-i18n/no-eager-translation': [
            'warn',
            { autoImport: ['t', 'useI18n'] },
          ],
          'ai-i18n/no-unsubscribed-runtime-state': [
            'warn',
            { autoImport: ['getLang', 'getLangLoadState'] },
          ],
          'ai-i18n/no-unsubscribed-t': [
            'warn',
            { autoImport: ['t', 'useI18n'] },
          ],
          'ai-i18n/static-candidate-limit': [
            'warn',
            { autoImport: ['t', 'useI18n'] },
          ],
          'ai-i18n/t-static-args': ['error', { autoImport: ['t', 'useI18n'] }],
        },
      }),
    ]);
    expect(plugin.configs?.['vue-auto-import']).toEqual([
      expect.objectContaining({
        languageOptions: {
          globals: {
            t: 'readonly',
            setLang: 'readonly',
            getLang: 'readonly',
            getLangs: 'readonly',
            getLangLoadState: 'readonly',
            subscribe: 'readonly',
            useI18n: 'readonly',
            tRef: 'readonly',
            defineI18nMessages: 'readonly',
          },
        },
        rules: {
          'ai-i18n/no-eager-translation': [
            'warn',
            { autoImport: ['t', 'tRef', 'useI18n'] },
          ],
          'ai-i18n/no-unsubscribed-runtime-state': [
            'warn',
            { autoImport: ['getLang', 'getLangLoadState'] },
          ],
          'ai-i18n/no-unsubscribed-t': [
            'warn',
            { autoImport: ['t', 'tRef', 'useI18n'] },
          ],
          'ai-i18n/static-candidate-limit': [
            'warn',
            { autoImport: ['t', 'tRef', 'useI18n'] },
          ],
          'ai-i18n/t-static-args': [
            'error',
            { autoImport: ['t', 'tRef', 'useI18n'] },
          ],
        },
      }),
    ]);
    expect(plugin.configs?.['vanilla-auto-import']).toEqual([
      expect.objectContaining({
        languageOptions: {
          globals: expect.objectContaining({
            t: 'readonly',
            getLangLoadState: 'readonly',
          }),
        },
        rules: {
          'ai-i18n/no-eager-translation': ['warn', { autoImport: ['t'] }],
          'ai-i18n/no-unsubscribed-runtime-state': [
            'warn',
            { autoImport: ['getLang', 'getLangLoadState'] },
          ],
          'ai-i18n/static-candidate-limit': ['warn', { autoImport: ['t'] }],
          'ai-i18n/t-static-args': ['error', { autoImport: ['t'] }],
        },
      }),
    ]);
    expect(plugin.configs).not.toHaveProperty('react');
    expect(plugin.configs).not.toHaveProperty('vanilla');
    for (const name of [
      'recommended',
      'vue',
      'vanilla-auto-import',
      'vue-auto-import',
      'react-auto-import',
    ]) {
      const [config] = plugin.configs?.[name] as Linter.Config[];
      expect(Object.keys(config.rules ?? {})[0]).toBe('ai-i18n/t-static-args');
      expect(config.languageOptions?.globals).toMatchObject({
        defineI18nMessages: 'readonly',
      });
    }
  });

  it('matches each framework auto-import API set', async () => {
    const topLevelT = 't(props.label)';
    const hookT = 'const { t: tr } = useI18n(); tr(props.label)';
    const cases = [
      {
        config: plugin.configs!['vanilla-auto-import']! as Linter.Config[],
        hookErrors: 0,
        name: 'vanilla',
      },
      {
        config: plugin.configs!['vue-auto-import']! as Linter.Config[],
        hookErrors: 1,
        name: 'vue',
      },
      {
        config: plugin.configs!['react-auto-import']! as Linter.Config[],
        hookErrors: 1,
        name: 'react',
      },
    ];

    for (const item of cases) {
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: item.config,
      });
      const [topLevelResult] = await eslint.lintText(topLevelT, {
        filePath: `src/${item.name}.js`,
      });
      const [hookResult] = await eslint.lintText(hookT, {
        filePath: `src/${item.name}-hook.js`,
      });

      expect(topLevelResult?.messages).toMatchObject([
        { ruleId: 'ai-i18n/t-static-args', messageId: 'invalidUsage' },
      ]);
      expect(
        hookResult?.messages.filter(
          (message) => message.ruleId === 'ai-i18n/t-static-args',
        ),
      ).toHaveLength(item.hookErrors);
    }
  });

  it('enables the tRef auto import only for Vue', async () => {
    for (const [name, expectedErrors] of [
      ['vue', 1],
      ['react', 0],
      ['vanilla', 0],
    ] as const) {
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: plugin.configs![
          `${name}-auto-import`
        ] as Linter.Config[],
      });
      const [result] = await eslint.lintText('tRef(props.label)', {
        filePath: `src/${name}.js`,
      });

      expect(
        result?.messages.filter(
          (message) => message.ruleId === 'ai-i18n/t-static-args',
        ),
      ).toHaveLength(expectedErrors);
    }
  });

  it('enables lifecycle warnings without duplicate diagnostics', async () => {
    const recommended = new ESLint({
      overrideConfigFile: true,
      overrideConfig: plugin.configs!.recommended as Linter.Config[],
    });
    const react = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.tsx'],
          languageOptions: { parser: tseslint.parser },
        },
        ...(plugin.configs!.recommended as Linter.Config[]),
      ],
    });

    const [snapshot] = await recommended.lintText(
      "import { t } from 'virtual:ai-i18n'; export const label = t('保存')",
      { filePath: 'src/messages.js' },
    );
    const [runtimeRender] = await react.lintText(
      "import { t } from 'virtual:ai-i18n'; export function App() { return <h1>{t('标题')}</h1> }",
      { filePath: 'src/App.tsx' },
    );
    const [hookRender] = await react.lintText(
      "import { useI18n } from 'virtual:ai-i18n'; export function App() { const { t } = useI18n(); return <h1>{t('标题')}</h1> }",
      { filePath: 'src/HookApp.tsx' },
    );

    expect(snapshot?.messages).toMatchObject([
      {
        ruleId: 'ai-i18n/no-eager-translation',
        messageId: 'eagerTranslation',
        severity: 1,
      },
    ]);
    expect(runtimeRender?.messages).toMatchObject([
      {
        ruleId: 'ai-i18n/no-unsubscribed-t',
        messageId: 'unsubscribedT',
        severity: 1,
      },
    ]);
    expect(hookRender?.messages).toEqual([]);
  });

  it('keeps Vue SFC checks opt-in', async () => {
    const vueLanguage = {
      files: ['**/*.vue'],
      languageOptions: {
        parser: vueParser,
        parserOptions: { parser: tseslint.parser },
      },
    };
    const code = [
      '<script setup>',
      "import { useI18n } from 'virtual:ai-i18n'",
      'const { t } = useI18n()',
      '</script>',
      '<template>{{ t(props.label) }}</template>',
    ].join('\n');
    const recommended = plugin.configs!.recommended! as Linter.Config[];
    const vue = plugin.configs!.vue! as Linter.Config[];
    const withoutVue = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [vueLanguage, ...recommended],
    });
    const withVue = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [vueLanguage, ...vue],
    });

    const [defaultResult] = await withoutVue.lintText(code, {
      filePath: 'src/App.vue',
    });
    const [vueResult] = await withVue.lintText(code, {
      filePath: 'src/App.vue',
    });

    expect(defaultResult?.messages).toEqual([]);
    expect(vueResult?.messages).toMatchObject([
      { ruleId: 'ai-i18n/t-static-args', messageId: 'invalidUsage' },
    ]);
  });

  it('does not hide missing imports in the explicit Vue preset', async () => {
    const vueLanguage = {
      files: ['**/*.vue'],
      languageOptions: {
        parser: vueParser,
        parserOptions: { parser: tseslint.parser },
      },
    };
    const requireBindings = {
      files: ['**/*.vue'],
      rules: { 'no-undef': 'error' as const },
    };
    const code = [
      '<script setup>',
      'const { t } = useI18n()',
      '</script>',
      "<template>{{ t('保存') }}</template>",
    ].join('\n');
    const explicit = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        vueLanguage,
        ...(plugin.configs!.vue as Linter.Config[]),
        requireBindings,
      ],
    });
    const autoImport = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        vueLanguage,
        ...(plugin.configs!['vue-auto-import'] as Linter.Config[]),
        requireBindings,
      ],
    });

    const [explicitResult] = await explicit.lintText(code, {
      filePath: 'src/Explicit.vue',
    });
    const [autoImportResult] = await autoImport.lintText(code, {
      filePath: 'src/Auto.vue',
    });

    expect(explicitResult?.messages).toMatchObject([
      { ruleId: 'no-undef', message: "'useI18n' is not defined." },
    ]);
    expect(autoImportResult?.messages).toEqual([]);
  });
});
