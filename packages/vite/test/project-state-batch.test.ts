import { expect, it, vi } from 'vitest';
import { ProjectState } from '../src/project-state';

it('links a complete scan once and restores incremental dependent updates afterwards', () => {
  const state = new ProjectState(
    '/workspace',
    {
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [],
    },
    true,
  );
  const link = vi.spyOn(state.analyzer, 'link');
  const a =
    "import { t } from 'virtual:ai-i18n'; import { B } from './b'; export const A = '甲'; t(B)";
  state.setResolution('a.ts', './b', 'b.ts');
  state.setResolution('b.ts', './a', 'a.ts');
  state.setResolution('barrel.ts', './a', 'a.ts');
  state.setResolution('page.ts', './barrel', 'barrel.ts');
  state.update(a, 'a.ts');
  state.update(
    "import { t } from 'virtual:ai-i18n'; import { A } from './a'; export const B = '乙'; t(A)",
    'b.ts',
  );
  state.update("export { A } from './a'", 'barrel.ts');
  state.update("import { A } from './barrel'; t(A)", 'page.ts', {
    autoImportRuntime: true,
    mapLocation: (location) => ({ ...location, line: location.line + 10 }),
  });
  expect(link).not.toHaveBeenCalled();
  state.finishAnalysis();
  expect(link).toHaveBeenCalledOnce();
  expect(state.deferAnalysis).toBe(false);
  expect(state.modules.get('a.ts')?.messages[0]?.source).toBe('乙');
  expect(state.modules.get('b.ts')?.messages[0]?.source).toBe('甲');
  expect(state.modules.get('page.ts')?.messages[0]).toMatchObject({
    source: '甲',
    locations: [{ line: 11 }],
  });
  state.update(a.replace('甲', '修改'), 'a.ts');
  expect(state.modules.get('b.ts')?.messages[0]?.source).toBe('修改');
  expect(state.modules.get('page.ts')?.messages[0]?.source).toBe('修改');
});
