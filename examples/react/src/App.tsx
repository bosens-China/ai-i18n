function App() {
  const { t, setLang, currentLang, langs } = useI18n();
  const currentLanguage = langs.find(({ value }) => value === currentLang);

  return (
    <main className="demo-app">
      <header className="demo-header">
        <p className="demo-eyebrow">useI18n · React</p>
        <h1>{t('React 示例')}</h1>
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

        <article className="demo-card">
          <span className="demo-label">{t('切换语言')}</span>
          <div className="language-switcher">
            {langs.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === currentLang}
                onClick={() => void setLang(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </article>

        <article className="demo-card demo-card--highlight">
          <span className="demo-label">{t('文案变化')}</span>
          <div className="translation-output" aria-live="polite">
            <p>{t('切换后，这段文案会立即更新。')}</p>
            <span>{t('useI18n 实时订阅 Runtime 并重渲染。')}</span>
          </div>
        </article>
      </section>
    </main>
  );
}

export default App;
