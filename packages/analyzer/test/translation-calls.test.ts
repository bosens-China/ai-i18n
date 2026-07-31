import { describe, expect, it } from 'vitest';
import {
  AI_I18N_VIRTUAL_MODULE_ID,
  Analyzer,
  analyzeModule,
  extractMessages,
  findTranslationCalls,
} from '../src/index';

const hooks = [
  {
    module: AI_I18N_VIRTUAL_MODULE_ID,
    hook: 'useI18n',
    property: 't',
    autoImport: true,
  },
] as const;

describe('translation call discovery', () => {
  it('distinguishes Runtime and Hook bindings', () => {
    const module = analyzeModule(
      `import { t as runtimeT, tRef, tComputed as optionsT, useI18n as useTranslation } from 'virtual:ai-i18n'
const { t: hookT } = useTranslation()
const i18n = useTranslation()
runtimeT('Runtime')
hookT('Hook')
i18n.t\`Member \${value}\`
t('Auto import')
tRef('Imported Ref')
optionsT('Imported Options computed')
tComputed('Auto Options computed')
function local(t, tRef, tComputed) { t('Shadowed'); tRef('Shadowed Ref'); tComputed('Shadowed computed') }`,
      'View.tsx',
    );

    expect(
      findTranslationCalls(module, AI_I18N_VIRTUAL_MODULE_ID, hooks, true),
    ).toMatchObject([
      { kind: 'call', origin: 'runtime', line: 4 },
      { kind: 'call', origin: 'hook', line: 5 },
      { kind: 'tagged-template', origin: 'hook', line: 6 },
      { kind: 'call', origin: 'runtime', line: 7 },
      { kind: 'call', origin: 'vue-ref', line: 8 },
      { kind: 'call', origin: 'vue-computed', line: 9 },
      { kind: 'call', origin: 'vue-computed', line: 10 },
    ]);
  });

  it('follows a re-exported Runtime t binding', () => {
    const analyzer = new Analyzer({
      resolve(specifier) {
        if (specifier === AI_I18N_VIRTUAL_MODULE_ID) return specifier;
        return specifier === './bridge' ? '/bridge.ts' : null;
      },
    });
    analyzer.addFile(
      AI_I18N_VIRTUAL_MODULE_ID,
      'export function t(source) { return source }',
    );
    analyzer.addFile('/bridge.ts', "export { t } from 'virtual:ai-i18n'");
    const entry = analyzer.addFile(
      '/entry.ts',
      "import { t as translate } from './bridge'; translate('保存')",
    );
    analyzer.link();

    expect(findTranslationCalls(entry)).toMatchObject([
      { kind: 'call', origin: 'runtime', line: 1 },
    ]);
  });

  it('recognizes an auto-imported tRef without treating a local binding as runtime', () => {
    const module = analyzeModule(
      "tRef('自动导入'); function render(tRef) { tRef('局部') }",
      'View.vue.ts',
    );

    expect(
      findTranslationCalls(module, AI_I18N_VIRTUAL_MODULE_ID, [], true),
    ).toMatchObject([{ kind: 'call', origin: 'vue-ref', line: 1 }]);
  });

  it('recognizes only the selected auto-imported translation APIs', () => {
    const module = analyzeModule(
      `t('未开启')
tRef('未开启')
tComputed('已开启')
function render(tComputed) { tComputed('局部') }`,
      'Options.vue.ts',
    );

    expect(
      findTranslationCalls(
        module,
        AI_I18N_VIRTUAL_MODULE_ID,
        [],
        new Set(['tComputed'] as const),
      ),
    ).toMatchObject([{ kind: 'call', origin: 'vue-computed', line: 3 }]);
    expect(
      extractMessages(
        module,
        AI_I18N_VIRTUAL_MODULE_ID,
        [],
        new Set(['tComputed'] as const),
      ),
    ).toMatchObject({
      messages: [{ source: '已开启' }],
      warnings: [],
    });
  });
});
