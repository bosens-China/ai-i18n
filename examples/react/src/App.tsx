import { DEMO_MESSAGES } from '@/messages';

function App() {
  const { t, setLang, currentLang, langs } = useI18n();

  return (
    <div className="demo-shell">
      <header className="demo-header">
        <a className="demo-brand" href="#top">
          <span className="demo-brand-mark">F</span>
          <span>
            <strong>Fieldnotes</strong>
            <br />
            <small>{t('行间')}</small>
          </span>
        </a>
        <nav className="demo-nav" aria-label={t('主导航')}>
          <a href="#stories">{t('文章')}</a>
          <label>
            <span className="sr-only">{t('语言')}</span>
            <select
              className="demo-select"
              value={currentLang}
              onChange={(event) => void setLang(event.target.value)}
            >
              {langs.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      </header>
      <main id="top">
        <section className="grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <p className="demo-kicker">{t('一份关于日常的记录')}</p>
            <h1 className="demo-heading">{t('把想法，写成日常。')}</h1>
            <p className="demo-intro mt-6">
              {t('在忙碌与安静之间，记录那些值得慢下来想一想的事。')}
            </p>
            <a className="demo-button mt-5" href="#stories">
              {t('开始阅读')} <span aria-hidden="true">↗</span>
            </a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="hero-art-page">
              <span>
                FIELD
                <br />
                NOTES
              </span>
              <i></i>
              <i></i>
              <i></i>
              <b>✳</b>
            </div>
          </div>
        </section>
        <section id="stories" className="border-t border-line pt-10">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="demo-kicker">{t('慢慢读')}</p>
              <h2 className="demo-section-heading">{t('精选文章')}</h2>
            </div>
            <span className="text-sm text-muted">
              {t('关于生活、观察与创作')}
            </span>
          </div>
          <article className="demo-card featured">
            <div>
              <span className="demo-tag">{t('生活随笔')}</span>
              <h3 className="mt-6 text-2xl font-semibold">
                {t(DEMO_MESSAGES.featured)}
              </h3>
              <p className="demo-intro">{t(DEMO_MESSAGES.excerpt)}</p>
              <details>
                <summary className="demo-link">{t('阅读全文')}</summary>
                <p>
                  {t(
                    '试着在一天里留下一段不被安排的时间。散步、发呆，或者只是看一会儿窗外，灵感常常就在这些空隙里出现。',
                  )}
                </p>
              </details>
            </div>
            <div className="featured-art" aria-hidden="true">
              <span>✳</span>
            </div>
          </article>
          <div className="demo-grid mt-5">
            <article className="demo-card">
              <span className="demo-tag">{t('观察')}</span>
              <h3>{t('熟悉街道的新风景')}</h3>
              <p>{t('换一条路回家，也许会发现被忽略的美好。')}</p>
            </article>
            <article className="demo-card">
              <span className="demo-tag">{t('创作')}</span>
              <h3>{t('从一个小念头开始')}</h3>
              <p>{t('不用等到准备完美，先把第一句话写下来。')}</p>
            </article>
            <article className="demo-card">
              <span className="demo-tag">{t('日常')}</span>
              <h3>{t('给自己一杯茶的时间')}</h3>
              <p>{t('让片刻的停顿，成为一天温柔的注脚。')}</p>
            </article>
          </div>
        </section>
      </main>
      <footer className="demo-footer">
        <span>Fieldnotes · {t('行间')}</span>
        <span>{t('写下所见，留住所感。')}</span>
      </footer>
    </div>
  );
}
export default App;
