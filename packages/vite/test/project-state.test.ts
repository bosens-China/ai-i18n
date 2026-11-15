import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectState } from '../src/project-state';

const options = {
  repository: true,
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

describe('ProjectState incremental analysis', () => {
  it('normalizes root-external local sources without exposing absolute paths', () => {
    const posix = new ProjectState('/repo/apps/web', options);
    expect(posix.normalizeId('/repo/packages/ui/src/messages.ts')).toBe(
      '../../packages/ui/src/messages.ts',
    );

    const windows = new ProjectState('C:\\repo\\apps\\web', options);
    expect(
      windows.normalizeId('c:\\repo\\packages\\ui\\src\\messages.ts'),
    ).toBe('../../packages/ui/src/messages.ts');
    expect(
      windows.normalizeId('D:\\repo\\packages\\ui\\src\\messages.ts'),
    ).toBeNull();
  });

  it('reuses an analyzed module while the source fingerprint is unchanged', () => {
    const state = new ProjectState('/workspace', options);
    const source = '/workspace/src/main.ts';
    const code = "import { t } from 'virtual:ai-i18n'; t('首页')";

    const first = state.update(code, source);
    const analyzed = state.analyzer.module('src/main.ts');
    const second = state.update(code, source);

    expect(second?.affectedModuleIds).toEqual([]);
    expect(state.analyzer.module('src/main.ts')).toBe(analyzed);
    expect(first?.result).toBe(second?.result);
  });

  it('refreshes reverse dependents without reparsing their unchanged source', () => {
    const state = new ProjectState('/workspace', options);
    const texts = '/workspace/src/texts.ts';
    const main = '/workspace/src/main.ts';
    state.update("export const LABEL = '首页'", texts);
    state.update(
      "import { t } from 'virtual:ai-i18n'; import { LABEL } from './texts'; t(LABEL)",
      main,
    );
    state.setResolution(main, './texts', texts);
    state.update(
      "import { t } from 'virtual:ai-i18n'; import { LABEL } from './texts'; t(LABEL)",
      main,
      { force: true },
    );
    const analyzedMain = state.analyzer.module('src/main.ts');

    state.update("export const LABEL = '设置'", texts);

    expect(state.analyzer.module('src/main.ts')).toBe(analyzedMain);
    expect(state.registration('src/main.ts')).toMatchObject({
      'zh-CN': { 设置: '设置' },
    });
  });

  it('drops only modules outside the current Vite module graph', () => {
    const state = new ProjectState('/workspace', options);
    for (const source of ['src/main.ts', 'src/lazy.ts']) {
      state.update(
        `import { t } from 'virtual:ai-i18n'; t('${source}')`,
        path.join('/workspace', source),
      );
    }

    state.retain(['/workspace/src/main.ts']);

    expect(state.modules.has('src/main.ts')).toBe(true);
    expect(state.modules.has('src/lazy.ts')).toBe(false);
  });

  it('rejects one explicit message ID pointing at different source text', () => {
    const state = new ProjectState('/workspace', options);
    state.updateExtracted('', '/workspace/src/main.ts', [
      {
        id: 'action.submit',
        source: '提交',
        locations: [{ line: 1, column: 0 }],
      },
    ]);
    state.updateExtracted('', '/workspace/src/other.ts', [
      {
        id: 'action.submit',
        source: '保存',
        locations: [{ line: 1, column: 0 }],
      },
    ]);

    expect(() => state.snapshot()).toThrow(
      'Message ID "action.submit" is used by both "提交" and "保存"',
    );
  });
});
