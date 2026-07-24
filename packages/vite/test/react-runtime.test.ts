import { createI18nRuntime } from '@ai-i18n/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
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

  it('renders the loaded locale after an async switch', async () => {
    let finish!: (messages: { 标题: string }) => void;
    const loader = vi.fn(
      () =>
        new Promise<{ 标题: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const runtime = createI18nRuntime({
      sourceLang: 'zh-CN',
      defaultLang: 'zh-CN',
      locales: [
        { value: 'zh-CN', label: '中文' },
        { value: 'en-US', label: 'English' },
      ],
      localeLoaders: { 'en-US': loader },
    });
    runtime.registerModule('App.tsx', { 'zh-CN': { 标题: '标题' } });
    const useI18n = createReactI18n(runtime);
    const View = () => {
      const i18n = useI18n();
      return createElement('span', null, i18n.t('标题'));
    };

    const switching = runtime.setLang('en-US');
    expect(renderToStaticMarkup(createElement(View))).toBe('<span>标题</span>');
    finish({ 标题: 'Title' });
    await switching;
    expect(renderToStaticMarkup(createElement(View))).toBe(
      '<span>Title</span>',
    );
    expect(loader).toHaveBeenCalledOnce();
  });
});
