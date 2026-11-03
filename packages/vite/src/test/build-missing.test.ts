import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectState } from '../project-state';
import { assertBuildTranslations } from '../build-missing';

afterEach(() => vi.unstubAllEnvs());

it.each(['en-US', 'zh-CN'])(
  'reports all missing messages and distinguishes remote storage (%s)',
  (locale) => {
    vi.stubEnv('AI_I18N_DIAGNOSTIC_LOCALE', locale);
    const root = path.resolve('fixture');
    const project = new ProjectState(root, {
      sourceLang: 'zh',
      defaultLang: 'zh',
      locales: [
        { value: 'zh', label: '中文' },
        { value: 'en', label: 'English' },
      ],
    });
    project.update(
      `import { t } from 'virtual:ai-i18n';\n${Array.from({ length: 21 }, (_, i) => `t('文案${i}');`).join('\n')}`,
      path.join(root, 'main.ts'),
    );
    let message = '';
    try {
      assertBuildTranslations(project, path.join(root, 'i18n'), true);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('en: 21');
    expect(message).toContain('"文案20"');
    expect(message).toContain(
      locale === 'zh-CN'
        ? '无本地 translations JSON'
        : 'no local translations JSON',
    );
    expect(message).not.toContain('en JSON:');
    expect(message).toContain(path.join(root, 'i18n/extracted'));
  },
);
