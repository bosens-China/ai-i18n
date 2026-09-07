import { describe, expect, it } from 'vitest';
import { ProjectState } from '../src/project-state';

describe('Occurrence override change detection', () => {
  it('detects adding, editing and removing an occurrence even beneath a file override', () => {
    const state = new ProjectState('/workspace', {
      sourceLang: 'zh-CN',
      defaultLang: 'en-US',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    for (const source of ['src/main.ts', 'src/other.ts']) {
      state.updateExtracted('', `/workspace/${source}`, [
        {
          id: '保存',
          source: '保存',
          locations: [
            { line: 1, column: 0 },
            { line: 1, column: 10 },
          ],
        },
      ]);
    }
    const fileRule = {
      source: '保存',
      files: ['src/main.ts'],
      translations: { 'en-US': 'Save' },
    };
    state.hydrateOverrides({ version: 2, rules: [fileRule] });
    for (const value of ['Save here', '', undefined]) {
      const rules =
        value === undefined
          ? [fileRule]
          : [
              fileRule,
              {
                source: '保存',
                occurrences: [{ file: 'src/main.ts', line: 1, column: 10 }],
                translations: { 'en-US': value },
              },
            ];
      expect(state.hydrateOverrides({ version: 2, rules })).toEqual([
        'src/main.ts',
      ]);
      expect(state.hydrateOverrides({ version: 2, rules })).toEqual([]);
    }
  });
});
