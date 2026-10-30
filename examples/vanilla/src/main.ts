import { getLang, getLangs, setLang, subscribe, t } from 'virtual:ai-i18n';
import 'virtual:uno.css';
import '../../shared/base.css';
import '../../shared/blog.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        character
      ]!,
  );

function render() {
  const currentLang = getLang();
  app.innerHTML = `
    <div class="demo-shell">
      <header class="demo-header">
        <a class="demo-brand" href="#top"><span class="demo-brand-mark">F</span><span><strong>Fieldnotes</strong><br /><small>${escapeHtml(t('行间'))}</small></span></a>
        <nav class="demo-nav" aria-label="${escapeHtml(t('主导航'))}">
          <a href="#stories">${escapeHtml(t('文章'))}</a>
          <label><span class="sr-only">${escapeHtml(t('语言'))}</span><select id="language" class="demo-select">${getLangs()
            .map(
              ({ value, label }) =>
                `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`,
            )
            .join('')}</select></label>
        </nav>
      </header>
      <main id="top">
        <section class="grid gap-10 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div><p class="demo-kicker">${escapeHtml(t('一份关于日常的记录'))}</p><h1 class="demo-heading">${escapeHtml(t('把想法，写成日常。'))}</h1><p class="demo-intro mt-6">${escapeHtml(t('在忙碌与安静之间，记录那些值得慢下来想一想的事。'))}</p><a class="demo-button mt-5" href="#stories">${escapeHtml(t('开始阅读'))} <span aria-hidden="true">↗</span></a></div>
          <div class="hero-art" aria-hidden="true"><div class="hero-art-page"><span>FIELD<br />NOTES</span><i></i><i></i><i></i><b>✳</b></div></div>
        </section>
        <section id="stories" class="border-t border-line pt-10">
          <div class="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p class="demo-kicker">${escapeHtml(t('慢慢读'))}</p><h2 class="demo-section-heading">${escapeHtml(t('精选文章'))}</h2></div><span class="text-sm text-muted">${escapeHtml(t('关于生活、观察与创作'))}</span></div>
          <article class="demo-card featured"><div><span class="demo-tag">${escapeHtml(t('生活随笔'))}</span><h3 class="mt-6 text-2xl font-semibold">${escapeHtml(t('给生活留一点空白'))}</h3><p class="demo-intro">${escapeHtml(t('不必把每一刻都填满。留白让我们重新听见自己的想法。'))}</p><details><summary class="demo-link">${escapeHtml(t('阅读全文'))}</summary><p>${escapeHtml(t('试着在一天里留下一段不被安排的时间。散步、发呆，或者只是看一会儿窗外，灵感常常就在这些空隙里出现。'))}</p></details></div><div class="featured-art" aria-hidden="true"><span>✳</span></div></article>
          <div class="demo-grid mt-5">
            <article class="demo-card"><span class="demo-tag">${escapeHtml(t('观察'))}</span><h3>${escapeHtml(t('熟悉街道的新风景'))}</h3><p>${escapeHtml(t('换一条路回家，也许会发现被忽略的美好。'))}</p></article>
            <article class="demo-card"><span class="demo-tag">${escapeHtml(t('创作'))}</span><h3>${escapeHtml(t('从一个小念头开始'))}</h3><p>${escapeHtml(t('不用等到准备完美，先把第一句话写下来。'))}</p></article>
            <article class="demo-card"><span class="demo-tag">${escapeHtml(t('日常'))}</span><h3>${escapeHtml(t('给自己一杯茶的时间'))}</h3><p>${escapeHtml(t('让片刻的停顿，成为一天温柔的注脚。'))}</p></article>
          </div>
        </section>
      </main>
      <footer class="demo-footer"><span>Fieldnotes · ${escapeHtml(t('行间'))}</span><span>${escapeHtml(t('写下所见，留住所感。'))}</span></footer>
    </div>`;
  const language = app.querySelector<HTMLSelectElement>('#language')!;
  language.value = currentLang;
  language.addEventListener('change', () => void setLang(language.value));
}
render();
subscribe(render);
