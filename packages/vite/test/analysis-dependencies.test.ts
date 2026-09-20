import { expect, it, vi } from 'vitest';
import { resolveAnalysisDependencies } from '../src/analysis-dependencies';
import { ProjectState } from '../src/project-state';

it('defers refresh for an unloaded target but refreshes loaded and redirected dependencies', async () => {
  const project = new ProjectState('/workspace', {
    sourceLang: 'zh-CN',
    defaultLang: 'zh-CN',
    locales: [{ value: 'en', label: 'English' }],
  });
  const importer = '/workspace/main.ts';
  const code =
    "import { t } from 'virtual:ai-i18n'; import { label } from './label'; t(label)";
  project.update(code, importer);
  let target = '/workspace/label.ts';
  const transformRequest = vi.fn(async () => {
    project.update("export const label = '已加载'", target);
    return null;
  });
  const context = {
    environment: { mode: 'dev', transformRequest },
    resolve: async (specifier: string) =>
      specifier === './label' ? { id: target } : null,
    addWatchFile: vi.fn(),
    load: vi.fn(),
  } as unknown as Parameters<typeof resolveAnalysisDependencies>[0];
  const resolve = (pending: boolean) =>
    resolveAnalysisDependencies(
      context,
      project,
      importer,
      'main.ts',
      pending,
      (task) => Promise.resolve().then(task),
    );

  expect(await resolve(false)).toBe(false);
  expect(transformRequest).not.toHaveBeenCalled();
  // 路径仍然被记住，依赖首次加载后必须刷新 importer 的文案。
  expect(await resolve(true)).toBe(true);
  expect(transformRequest).toHaveBeenCalledOnce();
  expect(
    project.modules.get('main.ts')?.messages.map(({ source }) => source),
  ).toEqual(['已加载']);
  expect(await resolve(false)).toBe(false);

  target = '/workspace/replacement.ts';
  expect(await resolve(false)).toBe(true);
  project.update(code, importer, { force: true });
  expect(project.modules.get('main.ts')).toMatchObject({
    messages: [],
    pending: true,
  });
  project.update("export const label = '新目标'", target);
  expect(
    project.modules.get('main.ts')?.messages.map(({ source }) => source),
  ).toEqual(['新目标']);

  target = '/workspace/label.ts';
  expect(await resolve(false)).toBe(true);
  project.update(code, importer, { force: true });
  expect(
    project.modules.get('main.ts')?.messages.map(({ source }) => source),
  ).toEqual(['已加载']);
});
