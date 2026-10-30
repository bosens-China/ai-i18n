import {
  getLang,
  getLangs,
  getTranslationMeta,
  setLang,
  subscribe,
  t,
} from 'virtual:ai-i18n';
import '../style.css';

interface ServerStatus {
  version: string;
  scenario: string;
  keys: string[];
  publishes: number;
  loads: number;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
let status: ServerStatus | undefined;
let notice = '';
let busy = false;
let lazyText: (() => string) | undefined;

// 译文与服务端状态都按文本显示，不能作为 HTML 注入页面。
const escape = (value: unknown) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

async function readStatus() {
  if (!import.meta.env.DEV) return;
  try {
    const response = await fetch('/api/status');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== 'object' ||
      !('version' in data) ||
      typeof data.version !== 'string' ||
      !('keys' in data) ||
      !Array.isArray(data.keys) ||
      !data.keys.every((key) => typeof key === 'string') ||
      !('scenario' in data) ||
      typeof data.scenario !== 'string' ||
      !('publishes' in data) ||
      typeof data.publishes !== 'number' ||
      !('loads' in data) ||
      typeof data.loads !== 'number'
    ) {
      throw new Error('Invalid demo status');
    }
    status = data as ServerStatus;
  } catch {
    notice = t('请求失败，请查看终端。');
  }
  render();
}

async function action(path: string, body: object) {
  busy = true;
  render();
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    notice = t('操作完成');
    await readStatus();
  } catch {
    notice = t('请求失败，请查看终端。');
  } finally {
    busy = false;
    render();
  }
}

function render() {
  const meta = getTranslationMeta();
  app.innerHTML = `
    <main class="demo-app remote-app">
      <header class="demo-header">
        <div class="header-titles"><p class="demo-eyebrow">Hono → ai-i18n → dist</p><h1>${escape(t('远程译文演示'))}</h1></div>
        <label class="language-control">${escape(t('语言'))}
          <select id="language">${getLangs()
            .map(
              ({ value, label }) =>
                `<option value="${escape(value)}">${escape(label)}</option>`,
            )
            .join('')}</select>
        </label>
      </header>
      <section class="demo-panel" aria-label="${escape(t('当前页面快照'))}">
        <article class="demo-card snapshot-card">
          <span class="demo-label">${escape(t('当前页面快照'))}</span>
          <strong id="applied-version" class="version">${escape(meta?.version ?? t('尚未获取'))}</strong>
          <p><code id="remote-mode">${escape(meta?.mode ?? '—')}</code></p>
          <p id="translated-copy" class="main-copy">${escape(t('保存成功'))}</p>
          <span class="demo-label">${escape(t('同一句原文，不同语境'))}</span>
          <div class="context-pair"><span>${escape(t('提交', { comment: '表单按钮' }))}</span><span>${escape(t('提交', { comment: 'Git 操作' }))}</span></div>
          <button id="lazy" ${busy ? 'disabled' : ''}>${escape(t('打开懒加载示例'))}</button>
          <p id="lazy-output" aria-live="polite">${lazyText ? escape(lazyText()) : ''}</p>
        </article>
        <article class="demo-card server-card">
          <span class="demo-label">${escape(t('服务端最新版本'))}</span>
          <strong id="server-version" class="version">${escape(status?.version ?? '—')}</strong>
          ${
            import.meta.env.DEV
              ? `
            <dl class="server-stats"><div><dt>${escape(t('已接收文案'))}</dt><dd id="received-count">${status?.keys.length ?? 0}</dd></div>
              <div><dt>${escape(t('提交次数'))}</dt><dd>${status?.publishes ?? 0}</dd></div>
              <div><dt>${escape(t('获取次数'))}</dt><dd>${status?.loads ?? 0}</dd></div></dl>
            <p>${escape(t('测试场景'))}: <code id="scenario">${escape(status?.scenario ?? '—')}</code></p>
            <button id="status">${escape(t('读取服务端状态'))}</button>
          `
              : `<p>${escape(t('静态构建快照，不连接后端。'))}</p>`
          }
        </article>
      </section>
      <section class="demo-card flow-panel">
        ${meta?.mode === 'overlay' ? `<p>${escape(t('远程叠加：服务器优先，其余使用本地译文。'))}</p><p class="muted">${escape(t('撤销后恢复本地人工译文。'))}</p>` : ''}
        <p>${escape(t('服务端更新不会自动替换当前快照。'))}</p>
        <p class="muted">${escape(t('开发服务重启后会重新提交和获取；静态页面需要重新构建。'))}</p>
        ${
          import.meta.env.DEV
            ? `<div class="actions">
          ${meta?.mode === 'overlay' ? `<button data-scenario="partial">${escape(t('启用部分远程覆盖'))}</button><button data-scenario="withdrawn">${escape(t('撤销全部远程覆盖'))}</button>` : ''}
          <button data-scenario="ready">${escape(t('发布下一版译文'))}</button>
          <button data-scenario="pending">${escape(t('模拟缺译'))}</button>
          <button data-scenario="invalid">${escape(t('模拟无效译文'))}</button>
          <button data-scenario="ready">${escape(t('恢复完整译文'))}</button>
          <button id="restart" class="primary">${escape(t('重启 Dev 并获取'))}</button>
        </div>`
            : ''
        }
        <p id="notice" role="status">${escape(notice)}</p>
      </section>
      ${
        import.meta.env.DEV
          ? `<details class="demo-card"><summary>${escape(t('此处可以查看服务器实际收到的 key。'))}</summary>
        <pre id="submitted-keys">${escape(JSON.stringify(status?.keys ?? [], null, 2))}</pre></details>`
          : ''
      }
    </main>`;
  const language = app.querySelector<HTMLSelectElement>('#language')!;
  language.value = getLang();
  language.onchange = () => {
    void setLang(language.value);
  };
  app.querySelector<HTMLButtonElement>('#lazy')!.onclick = () => {
    void import('./lazy').then((module) => {
      lazyText = module.readLazyText;
      render();
    });
  };
  if (!import.meta.env.DEV) return;
  app.querySelector<HTMLButtonElement>('#status')!.onclick = () => {
    void readStatus();
  };
  app.querySelector<HTMLButtonElement>('#restart')!.onclick = () => {
    void action('/api/demo/restart', {});
  };
  for (const button of app.querySelectorAll<HTMLButtonElement>(
    '[data-scenario]',
  )) {
    button.disabled = busy;
    button.onclick = () => {
      void action('/api/demo/scenario', { scenario: button.dataset.scenario });
    };
  }
}

render();
subscribe(() => {
  render();
  void readStatus();
});
void readStatus();
