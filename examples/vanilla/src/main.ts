import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

function render() {
  const currentLang = getLang();
  const langs = getLangs();
  const currentLanguage = langs.find(({ value }) => value === currentLang);

  app.innerHTML = `
    <main class="demo-app">
      <header class="demo-header">
        <p class="demo-eyebrow">virtual:ai-i18n</p>
        <h1>${t('Vanilla 示例')}</h1>
      </header>

      <section class="demo-panel" aria-label="${t('交互式语言切换演示')}">
        <article class="demo-card">
          <span class="demo-label">${t('当前语言')}</span>
          <div class="locale-readout" aria-live="polite">
            <span class="status-dot" aria-hidden="true"></span>
            <strong>${currentLanguage?.label ?? currentLang}</strong>
            <code>${currentLang}</code>
          </div>
        </article>

        <article class="demo-card">
          <span class="demo-label">${t('切换语言')}</span>
          <label class="language-control">
            <span class="sr-only">${t('语言')}</span>
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

        <article class="demo-card demo-card--highlight">
          <span class="demo-label">${t('文案变化')}</span>
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
