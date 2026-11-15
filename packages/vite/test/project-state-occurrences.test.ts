import { expect, it } from 'vitest';
import { ProjectState } from '../src/project-state';

it('keeps all source locations for Review while registering one translation identity', () => {
  const state = new ProjectState('/workspace', {
    sourceLang: 'zh-CN',
    defaultLang: 'zh-CN',
    locales: [{ value: 'zh-CN', label: '中文' }],
  });
  state.updateExtracted('', '/workspace/src/main.ts', [
    {
      id: '保存',
      source: '保存',
      locations: [
        { line: 1, column: 0 },
        { line: 1, column: 10 },
      ],
    },
  ]);
  expect(state.registration('src/main.ts')).toEqual({
    'zh-CN': { 保存: '保存' },
  });
  expect(
    state.snapshot().extracted['src/main.ts']?.messages[0]?.locations,
  ).toEqual([
    { line: 1, column: 0 },
    { line: 1, column: 10 },
  ]);
});
