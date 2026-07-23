/* @jsxImportSource vue */
import { useI18n } from '@ai-i18n/vue';
import { defineComponent } from 'vue';

export const VueJsxPanel = defineComponent(() => {
  const { t, setLang, currentLang } = useI18n();

  return () => (
    <section>
      <h2>{t('Vue JSX 面板')}</h2>
      <p>
        {t('当前语言')}：{currentLang.value}
      </p>
      <button type="button" onClick={() => void setLang('en-US')}>
        {t('切换到英文')}
      </button>
    </section>
  );
});
