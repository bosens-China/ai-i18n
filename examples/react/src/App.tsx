function App() {
  const { t, setLang, currentLang, langs } = useI18n();
  const currentLanguage = langs.find(({ value }) => value === currentLang);

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">@boses/vite · React live runtime</p>
        <h1>{t('语言切换，应该一眼可见')}</h1>
        <p className="lede">
          {t('这个示例把当前语言、切换动作和文案变化放在同一个视图里。')}
        </p>
      </header>

      <section className="demo-grid" aria-label={t('交互式语言切换演示')}>
        <article className="demo-step">
          <span className="step-number">01</span>
          <h2>{t('当前语言')}</h2>
          <div className="locale-readout" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <strong>{currentLanguage?.label ?? currentLang}</strong>
            <code>{currentLang}</code>
          </div>
        </article>

        <article className="demo-step">
          <span className="step-number">02</span>
          <h2>{t('切换语言')}</h2>
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

        <article className="demo-step result-step">
          <span className="step-number">03</span>
          <h2>{t('文案变化')}</h2>
          <div className="translation-output" aria-live="polite">
            <p>{t('让产品自然地说每一种语言')}</p>
            <span>{t('切换后，这段文案会立即更新。')}</span>
          </div>
        </article>
      </section>

      <footer className="runtime-note">
        <span aria-hidden="true">↳</span>
        {t('由 useI18n 实时订阅 Runtime')}
      </footer>
    </main>
  );
}

export default App;
