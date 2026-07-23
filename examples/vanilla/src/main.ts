import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

function render() {
  const currentLang = getLang();
  const langs = getLangs();
  const currentLanguage = langs.find(({ value }) => value === currentLang);

  app.innerHTML = `
    <main class="page-shell">
      <header class="hero">
        <p class="eyebrow">virtual:ai-i18n · browser runtime</p>
        <h1>${t('Vanilla 示例')}</h1>
        <p class="lede">${t('显式调用会被静态提取')}</p>
      </header>

      <section class="demo-grid" aria-label="${t('交互式语言切换演示')}">
        <article class="demo-step">
          <span class="step-number">01</span>
          <h2>${t('当前语言')}</h2>
          <div class="locale-readout" aria-live="polite">
            <span class="status-dot" aria-hidden="true"></span>
            <strong>${currentLanguage?.label ?? currentLang}</strong>
            <code>${currentLang}</code>
          </div>
        </article>

        <article class="demo-step">
          <span class="step-number">02</span>
          <h2>${t('切换语言')}</h2>
          <label class="language-control">
            <span>${t('语言')}</span>
            <select id="language">
              ${langs
                .map(
                  ({ value, label }) =>
                    `<option value="${value}">${label}</option>`,
                )
                .join('')}
            </select>
          </label>
        </article>

        <article class="demo-step result-step">
          <span class="step-number">03</span>
          <h2>${t('文案变化')}</h2>
          <div class="translation-output" aria-live="polite">
            <p>${t('切换后，这段文案会立即更新。')}</p>
            <span>${t('订阅 Runtime 后重新渲染原生 DOM。')}</span>
          </div>
        </article>
      </section>
    </main>
  `;

  const language = app.querySelector<HTMLSelectElement>('#language')!;
  language.value = currentLang;
  language.addEventListener('change', (event) => {
    void setLang((event.currentTarget as HTMLSelectElement).value);
  });
}

render();
subscribe(render);
