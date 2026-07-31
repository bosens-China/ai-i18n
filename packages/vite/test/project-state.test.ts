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
      revision: 1,
      messages: {
        保留: {
          source: '保留',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Keep' },
        },
        移除: {
          source: '移除',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Remove' },
        },
      },
    });

    expect(state.registration('src/main.ts', 'zh-CN')).toEqual({
      'zh-CN': { 保留: '保留' },
    });
    state.retain(['/workspace/src/main.ts']);
    expect(state.localeMessages('en-US')).toEqual({ 保留: 'Keep' });
  });

  it('prefers exact human overrides, then default human overrides, then AI memory', () => {
    const state = new ProjectState('/workspace', options);
    state.updateExtracted('', '/workspace/src/main.ts', [
      {
        id: '提交#Git 操作',
        source: '提交',
        comment: 'Git 操作',
        locations: [{ line: 1, column: 0 }],
      },
      {
        id: '提交',
        source: '提交',
        locations: [{ line: 2, column: 0 }],
      },
      {
        id: '取消',
        source: '取消',
        locations: [{ line: 3, column: 0 }],
      },
    ]);
    state.hydrateCache({
      version: 1,
      revision: 1,
      messages: {
        '提交#Git 操作': {
          source: '提交',
          sourceLang: 'zh-CN',
          comment: 'Git 操作',
          translations: { 'en-US': 'AI commit' },
        },
        提交: {
          source: '提交',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'AI submit' },
        },
        取消: {
          source: '取消',
          sourceLang: 'zh-CN',
          translations: { 'en-US': 'Cancel' },
        },
      },
    });
    state.hydrateOverrides({
      version: 1,
      messages: {
        提交: {
          default: { 'en-US': 'Submit' },
          byId: { '提交#Git 操作': { 'en-US': 'Commit' } },
        },
      },
    });

    expect(state.registration('src/main.ts', 'en-US')).toEqual({
      'en-US': {
        '提交#Git 操作': 'Commit',
        提交: 'Submit',
        取消: 'Cancel',
      },
    });
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
