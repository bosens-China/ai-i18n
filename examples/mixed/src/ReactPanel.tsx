import { useI18n } from '@ai-i18n/react';

export function ReactPanel() {
  const { t } = useI18n();

  return (
    <section className="demo-step result-step">
      <span className="step-number">03 · React</span>
      <h2>{t('文案变化')}</h2>
      <div className="translation-output" aria-live="polite">
        <p>{t('三个框架共享同一份 Runtime 状态')}</p>
        <span>{t('任意入口切换，所有面板同时更新。')}</span>
      </div>
    </section>
  );
}
