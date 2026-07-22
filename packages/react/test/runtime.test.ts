import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let lang = 'zh-CN';
  return {
    getLang: () => lang,
    getLangs: () => [
      { value: 'zh-CN', label: '中文' },
      { value: 'en-US', label: 'English' },
    ],
    setLang: async (value: string) => {
      lang = value;
      listeners.forEach((listener) => listener());
    },
    t: (source: string) => (lang === 'en-US' ? 'Title' : source),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock('virtual:ai-i18n', () => runtime);

describe('@ai-i18n/react runtime', () => {
  it('renders from the Core snapshot and follows language changes', async () => {
    const { useI18n } = await import('../src/index');
    const View = () => {
      const i18n = useI18n();
      return createElement('span', null, `${i18n.currentLang}:${i18n.t('标题')}`);
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
