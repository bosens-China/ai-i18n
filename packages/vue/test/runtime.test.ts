import { computed } from 'vue';
import { describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let lang = 'zh-CN';
  return {
    listeners,
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

describe('@ai-i18n/vue runtime', () => {
  it('updates computed language and translated text from Core subscription', async () => {
    const { useI18n } = await import('../src/index');
    const i18n = useI18n();
    const text = computed(() => i18n.t('标题'));

    expect(i18n.currentLang.value).toBe('zh-CN');
    expect(text.value).toBe('标题');
    await i18n.setLang('en-US');
    expect(i18n.currentLang.value).toBe('en-US');
    expect(text.value).toBe('Title');
    expect(i18n.langs.value).toHaveLength(2);
  });
});
