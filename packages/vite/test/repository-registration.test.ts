import path from 'node:path';
import { expect, it } from 'vitest';
import { ProjectState } from '../src/project-state.js';
import { fileId, fileMessageKey } from '../src/repository-paths.js';

it('registers global and file identities without occurrence-specific translation keys', () => {
  const root = '/workspace/registration-fixture';
  const source = path.join(root, 'src/page.ts');
  const state = new ProjectState(root, {
    repository: true,
    sourceLang: 'zh-CN',
    defaultLang: 'zh-CN',
    locales: [
      { value: 'zh-CN', label: '中文' },
      { value: 'en-US', label: 'English' },
    ],
  });
  state.update(
    "import { t } from 'virtual:ai-i18n'; t('保存'); t('保存', { scope: 'file' });",
    source,
  );
  const key = fileMessageKey(fileId(root, source), '保存');
  state.setRepositoryLocale('en-US', { 保存: 'Save', [key]: 'Save here' });
  expect(state.registration('src/page.ts')).toEqual({
    'zh-CN': { 保存: '保存', [key]: '保存' },
    'en-US': { 保存: 'Save', [key]: 'Save here' },
  });
});

it.each(['constructor', 'toString', '__proto__'])(
  'treats absent %s as untranslated',
  (source) => {
    const root = '/workspace/registration-fixture';
    const state = new ProjectState(root, {
      repository: true,
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    state.updateExtracted('', `${root}/a.ts`, [
      { id: source, source, locations: [{ line: 1, column: 0 }] },
    ]);
    const result = state.registration('a.ts')!['en-US']!;
    expect(Object.hasOwn(result, source)).toBe(true);
    expect(result[source]).toBeNull();
  },
);
