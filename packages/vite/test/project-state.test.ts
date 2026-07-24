import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectState } from '../src/project-state';

const options = {
  sourceLang: 'zh-CN',
  defaultLang: 'zh-CN',
  locales: [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ],
};

describe('ProjectState incremental analysis', () => {
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

  it('builds source-only registrations and locale views from active modules', () => {
    const state = new ProjectState('/workspace', options);
    state.update(
      `import { t } from 'virtual:ai-i18n'; t('保留')`,
      '/workspace/src/main.ts',
    );
    state.update(
      `import { t } from 'virtual:ai-i18n'; t('移除')`,
      '/workspace/src/lazy.ts',
    );
    state.hydrateCache({
      version: 1,
      files: {},
      messages: {
        保留: { source: '保留', translations: { 'en-US': 'Keep' } },
        移除: { source: '移除', translations: { 'en-US': 'Remove' } },
      },
    });

    expect(state.registration('src/main.ts', 'zh-CN')).toEqual({
      'zh-CN': { 保留: '保留' },
    });
    state.retain(['/workspace/src/main.ts']);
    expect(state.localeMessages('en-US')).toEqual({ 保留: 'Keep' });
  });
});
