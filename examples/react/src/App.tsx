import { DEMO_MESSAGES } from '@/messages';

function App() {
  const { t, setLang, currentLang, langs } = useI18n();
  const currentLanguage = langs.find(({ value }) => value === currentLang);
  const aliasStepIndex = currentLang === 'zh-CN' ? 0 : 1;

  return (
    <main className="demo-app">
      <header className="demo-header">
        <div className="header-titles">
          <p className="demo-eyebrow">useI18n · React</p>
          <h1>{t('React 示例')}</h1>
        </div>
        <div className="header-controls">
          <label className="language-control">
            <span className="sr-only">{t('语言')}</span>
            <select
              value={currentLang}
              onChange={(e) => void setLang(e.target.value)}
            >
              {langs.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <section className="demo-panel" aria-label={t('交互式语言切换演示')}>
        <article className="demo-card">
          <span className="demo-label">{t('当前语言')}</span>
          <div className="locale-readout" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <strong>{currentLanguage?.label ?? currentLang}</strong>
            <code>{currentLang}</code>
          </div>
        </article>

        <article className="demo-card demo-card--highlight">
          <span className="demo-label">{t('文案变化')}</span>
          <div className="translation-output" aria-live="polite">
            <p>{t('切换后，这段文案会立即更新。')}</p>
            <span>{t('useI18n 实时订阅 Runtime 并重渲染。')}</span>
          </div>
        </article>

        <article className="demo-card">
          <span className="demo-label">{t(DEMO_MESSAGES.aliasStatus)}</span>
          <div className="translation-output">
            <p>{t(DEMO_MESSAGES.steps[aliasStepIndex])}</p>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
