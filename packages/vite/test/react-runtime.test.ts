import { createI18nRuntime } from '@ai-i18n/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createReactI18n } from '../src/react';

describe('React runtime adapter', () => {
  it('renders from the current Core snapshot', async () => {
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
    });
    runtime.registerModule('App.tsx', {
      'zh-CN': { 标题: '标题' },
      'en-US': { 标题: 'Title' },
    });
    const useI18n = createReactI18n(runtime);
    const View = () => {
      const i18n = useI18n();
      return createElement(
        'span',
        null,
        `${i18n.currentLang}:${i18n.t('标题')}`,
      );
    };

    expect(renderToStaticMarkup(createElement(View))).toBe(
      '<span>zh-CN:标题</span>',
    );
    await runtime.setLang('en-US');
    expect(renderToStaticMarkup(createElement(View))).toBe(
      '<span>en-US:Title</span>',
    );
  });
});
