/* @jsxImportSource vue */
import { useI18n } from '@ai-i18n/vue';
import { defineComponent } from 'vue';

export const VueJsxPanel = defineComponent(() => {
  const { t, setLang, currentLang, langs } = useI18n();

  return () => (
    <section class="demo-step">
      <span class="step-number">02 · Vue JSX</span>
      <h2>{t('切换语言')}</h2>
      <div class="language-switcher">
        {langs.value.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={value === currentLang.value}
            onClick={() => void setLang(value)}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
});
