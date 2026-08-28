import {
  REVIEW_UI_THEME_CHANGE_EVENT,
  readResolvedReviewUiTheme,
  readReviewUiThemePreference,
  resolveReviewUiTheme,
  type ReviewUiTheme,
  type ReviewWorkbenchController,
  type ReviewWorkbenchModule,
  type ReviewWorkbenchSelection,
} from '@ai-i18n/core';
import {
  parseReviewPanelPreferences,
  resizeReviewPanelHeight,
  reviewPanelHeight,
  type ReviewPanelPreferences,
} from './review-client-layout.js';

const STORAGE_KEY = 'ai-i18n.review.panel.v1';
const ELEMENT_NAME = 'ai-i18n-review';

interface ReviewPanelOptions {
  workbenchModule: string;
  onDestroy?: () => void;
  onLocateMessage: (messageKey: string) => void;
  onOpen: () => void;
  onPick: () => void;
}

interface ReviewHostElement extends HTMLElement {
  readonly reviewShadow: ShadowRoot;
  reviewCleanup?: () => void;
}

export interface ReviewPanelShell {
  host: HTMLElement;
  clearHighlight(): void;
  close(): void;
  destroy(): void;
  hide(): void;
  highlight(rect: DOMRect): void;
  open(): void;
  pageViewportBottom(): number;
  setPageMessageKeys(messageKeys: readonly string[]): void;
  setSelection(selection: ReviewWorkbenchSelection): void;
  showLauncher(): void;
  updateCount(count: number): void;
}

interface OverlayCopy {
  close: string;
  currentPage: string;
  failed: string;
  frame: string;
  loading: string;
  open: string;
  pick: string;
  resize: string;
  title: string;
}

export function createReviewPanelShell(
  options: ReviewPanelOptions,
): ReviewPanelShell {
  const copy = overlayCopy();
  const host = createHostElement();
  const shadow = host.reviewShadow;
  shadow.innerHTML = overlayMarkup(copy);
  document.body.append(host);

  const launcher = requiredElement<HTMLButtonElement>(shadow, '#launcher');
  const panel = requiredElement<HTMLElement>(shadow, '#panel');
  const workbench = requiredElement<HTMLElement>(shadow, '#workbench');
  const loading = requiredElement<HTMLElement>(shadow, '#loading');
  const highlighter = requiredElement<HTMLElement>(shadow, '#highlighter');
  const count = requiredElement<HTMLElement>(shadow, '#page-count');
  const resizer = requiredElement<HTMLElement>(shadow, '#resizer');
  let preferences = readPreferences();
  let resizing = false;
  let previousCursor = '';
  let previousUserSelect = '';
  let controller: ReviewWorkbenchController | undefined;
  let controllerTask: Promise<ReviewWorkbenchController> | undefined;
  let pageMessageKeys: readonly string[] = [];
  let selection: ReviewWorkbenchSelection | undefined;
  let destroyed = false;
  let themeMedia: MediaQueryList | undefined;

  function applyTheme(theme: ReviewUiTheme): void {
    host.dataset.theme = theme;
  }

  function syncTheme(): void {
    applyTheme(readResolvedReviewUiTheme());
  }

  function onThemeChange(event: Event): void {
    const detail = (event as CustomEvent<{ theme?: ReviewUiTheme }>).detail;
    applyTheme(detail?.theme ?? readResolvedReviewUiTheme());
  }

  function onSystemThemeChange(): void {
    if (readReviewUiThemePreference() === 'system') {
      applyTheme(
        resolveReviewUiTheme(
          'system',
          themeMedia?.matches ?? readResolvedReviewUiTheme() === 'dark',
        ),
      );
    }
  }

  syncTheme();
  document.addEventListener(REVIEW_UI_THEME_CHANGE_EVENT, onThemeChange);
  if (typeof globalThis.matchMedia === 'function') {
    themeMedia = globalThis.matchMedia('(prefers-color-scheme: dark)');
    themeMedia.addEventListener('change', onSystemThemeChange);
  }

  function applyLayout(): void {
    const height = reviewPanelHeight(preferences, viewport());
    panel.style.setProperty('--review-panel-height', `${height}px`);
    resizer.setAttribute('aria-valuenow', String(height));
  }

  async function loadWorkbench(): Promise<ReviewWorkbenchController> {
    if (controller) return controller;
    return (controllerTask ??= import(
      /* @vite-ignore */ options.workbenchModule
    )
      .then((module: ReviewWorkbenchModule) => {
        if (typeof module.mountReviewWorkbench !== 'function') {
          throw new TypeError('Missing mountReviewWorkbench export.');
        }
        if (destroyed) throw new Error('Review host was removed.');
        controller = module.mountReviewWorkbench(workbench, {
          onLocateMessage: options.onLocateMessage,
        });
        controller.setPageMessageKeys(pageMessageKeys);
        if (selection) controller.setSelection(selection);
        loading.hidden = true;
        return controller;
      })
      .catch((cause: unknown) => {
        loading.textContent = copy.failed;
        loading.dataset.error = '';
        throw cause;
      }));
  }

  function open(): void {
    panel.hidden = false;
    launcher.hidden = true;
    void loadWorkbench().catch(() => undefined);
    options.onOpen();
  }

  function close(): void {
    panel.hidden = true;
    launcher.hidden = false;
  }

  function hide(): void {
    panel.hidden = true;
    launcher.hidden = true;
  }

  function showLauncher(): void {
    panel.hidden = true;
    launcher.hidden = false;
  }

  function startResize(event: PointerEvent): void {
    resizing = true;
    previousCursor = document.documentElement.style.cursor;
    previousUserSelect = document.documentElement.style.userSelect;
    document.documentElement.style.cursor = 'ns-resize';
    document.documentElement.style.userSelect = 'none';
    resizer.setPointerCapture(event.pointerId);
  }

  function resize(event: PointerEvent): void {
    if (!resizing) return;
    preferences = resizeReviewPanelHeight(event.clientY, viewport());
    applyLayout();
  }

  function resizeWithKeyboard(event: KeyboardEvent): void {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentHeight = reviewPanelHeight(preferences, viewport());
    preferences = {
      height: currentHeight + (event.key === 'ArrowUp' ? 24 : -24),
    };
    applyLayout();
    savePreferences(preferences);
  }

  function stopResize(): void {
    if (!resizing) return;
    resizing = false;
    document.documentElement.style.cursor = previousCursor;
    document.documentElement.style.userSelect = previousUserSelect;
    savePreferences(preferences);
  }

  function destroy(removeHost = true): void {
    if (destroyed) return;
    destroyed = true;
    document.removeEventListener(REVIEW_UI_THEME_CHANGE_EVENT, onThemeChange);
    themeMedia?.removeEventListener('change', onSystemThemeChange);
    controller?.destroy();
    options.onDestroy?.();
    window.removeEventListener('resize', applyLayout);
    document.documentElement.style.cursor = previousCursor;
    document.documentElement.style.userSelect = previousUserSelect;
    if (removeHost) {
      host.reviewCleanup = undefined;
      host.remove();
    }
  }

  launcher.addEventListener('click', open);
  requiredElement<HTMLButtonElement>(shadow, '#pick').addEventListener(
    'click',
    options.onPick,
  );
  requiredElement<HTMLButtonElement>(shadow, '#close').addEventListener(
    'click',
    close,
  );
  resizer.addEventListener('pointerdown', startResize);
  resizer.addEventListener('pointermove', resize);
  resizer.addEventListener('pointerup', stopResize);
  resizer.addEventListener('pointercancel', stopResize);
  resizer.addEventListener('keydown', resizeWithKeyboard);
  window.addEventListener('resize', applyLayout);
  host.reviewCleanup = () => destroy(false);
  applyLayout();

  return {
    host,
    clearHighlight: () => {
      highlighter.hidden = true;
    },
    close,
    destroy,
    hide,
    highlight: (rect) => {
      Object.assign(highlighter.style, {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
      highlighter.hidden = false;
    },
    open,
    pageViewportBottom: () => panel.getBoundingClientRect().top,
    setPageMessageKeys(messageKeys) {
      pageMessageKeys = [...messageKeys];
      controller?.setPageMessageKeys(pageMessageKeys);
    },
    setSelection(next) {
      selection = next;
      controller?.setSelection(next);
    },
    showLauncher,
    updateCount: (value) => {
      count.textContent = `${copy.currentPage} ${value}`;
    },
  };
}

function createHostElement(): ReviewHostElement {
  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(
      ELEMENT_NAME,
      class extends HTMLElement {
        readonly reviewShadow = this.attachShadow({ mode: 'open' });
        reviewCleanup?: () => void;

        disconnectedCallback(): void {
          this.reviewCleanup?.();
        }
      },
    );
  }
  return document.createElement(ELEMENT_NAME) as ReviewHostElement;
}

function readPreferences(): ReviewPanelPreferences {
  try {
    return parseReviewPanelPreferences(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseReviewPanelPreferences(null);
  }
}

function savePreferences(preferences: ReviewPanelPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // 隐私模式或宿主禁用存储时，当前会话的布局仍然可用。
  }
}

function viewport() {
  return { height: window.innerHeight };
}

function requiredElement<T extends Element>(
  root: ShadowRoot,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing review panel element: ${selector}`);
  return element;
}

function overlayCopy(): OverlayCopy {
  const zh = navigator.language.toLowerCase().startsWith('zh');
  return zh
    ? {
        close: '关闭工作台',
        currentPage: '当前页',
        failed: '工作台加载失败，请查看 Vite 控制台后重试。',
        frame: '翻译校对工作台',
        loading: '正在加载翻译校对工作台…',
        open: '打开翻译校对',
        pick: '页面取词',
        resize: '调整工作台高度',
        title: '翻译校对',
      }
    : {
        close: 'Close workbench',
        currentPage: 'Page',
        failed:
          'Failed to load the workbench. Check the Vite console and retry.',
        frame: 'Translation review workbench',
        loading: 'Loading translation review workbench…',
        open: 'Open translation review',
        pick: 'Pick from page',
        resize: 'Resize workbench height',
        title: 'Translation review',
      };
}

function overlayMarkup(copy: OverlayCopy): string {
  return `<style>
    :host{all:initial;display:block;position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif;color:var(--review-shell-text);color-scheme:dark;--review-shell-bg:#111827;--review-shell-toolbar:#172033;--review-shell-border:#2f3d52;--review-shell-text:#e5edf8;--review-shell-muted:#8fa0b6;--review-shell-accent:#67e8f9;--review-shell-accent-soft:rgb(6 182 212 / 12%);--review-shell-primary:#60a5fa;--review-shell-primary-soft:rgb(59 130 246 / 12%);--review-shell-hover:#1c2738;--review-shell-danger-bg:rgb(127 29 29 / 24%);--review-shell-danger-text:#fca5a5;--review-highlight-border:#22d3ee;--review-highlight-bg:rgb(34 211 238 / 9%);--review-launcher-bg:#0f172a;--review-launcher-hover:#172033;--review-launcher-border:rgb(148 163 184 / 28%);--review-shadow-launcher:0 12px 30px rgb(2 6 23 / 42%),0 2px 8px rgb(2 6 23 / 28%);--review-shadow-panel:0 22px 72px rgb(2 6 23 / 58%)}
    :host([data-theme='light']){color-scheme:light;--review-shell-bg:#fff;--review-shell-toolbar:#f1f5f9;--review-shell-border:#cbd5e1;--review-shell-text:#0f172a;--review-shell-muted:#64748b;--review-shell-accent:#0891b2;--review-shell-accent-soft:rgb(8 145 178 / 10%);--review-shell-primary:#2563eb;--review-shell-primary-soft:rgb(37 99 235 / 9%);--review-shell-hover:#e8eef5;--review-shell-danger-bg:rgb(254 226 226 / 85%);--review-shell-danger-text:#dc2626;--review-highlight-border:#0891b2;--review-highlight-bg:rgb(8 145 178 / 10%);--review-launcher-bg:#fff;--review-launcher-hover:#f8fafc;--review-launcher-border:rgb(15 23 42 / 14%);--review-shadow-launcher:0 12px 28px rgb(15 23 42 / 16%),0 2px 7px rgb(15 23 42 / 8%);--review-shadow-panel:0 20px 56px rgb(15 23 42 / 14%)}
    *{box-sizing:border-box}button{font:inherit}
    #launcher{pointer-events:auto;position:fixed;z-index:3;right:18px;bottom:18px;width:46px;height:46px;padding:8px;border:1px solid var(--review-launcher-border);border-radius:15px;color:#fff;background:var(--review-launcher-bg);box-shadow:var(--review-shadow-launcher);cursor:pointer;display:grid;place-items:center;transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s ease,background-color .18s ease}
    #launcher:hover{transform:translateY(-2px) scale(1.02);background:var(--review-launcher-hover);box-shadow:0 16px 34px rgb(30 41 90 / 24%),0 3px 9px rgb(2 6 23 / 20%)}#launcher:active{transform:translateY(0) scale(.97)}#launcher:focus-visible,.tool:focus-visible{outline:2px solid var(--review-shell-accent);outline-offset:3px}
    .brand-icon{display:block;width:100%;height:100%}#launcher-icon{filter:drop-shadow(0 2px 4px rgb(79 70 229 / 18%))}
    #panel{pointer-events:auto;position:fixed;z-index:3;left:12px;right:12px;bottom:0;width:auto;height:var(--review-panel-height);overflow:visible;border:1px solid var(--review-shell-border);border-bottom:0;border-radius:11px 11px 0 0;background:var(--review-shell-bg);box-shadow:var(--review-shadow-panel)}
    #toolbar{height:36px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 8px 0 10px;border-bottom:1px solid var(--review-shell-border);background:var(--review-shell-bg);box-shadow:inset 0 -1px rgb(15 23 42 / 10%);user-select:none}
    #identity,#tools{display:flex;align-items:center;min-width:0}#identity{gap:8px}#tools{gap:2px}
    #brand{display:grid;place-items:center;width:21px;height:21px;padding:1px}
    #title{font-size:11px;font-weight:700;letter-spacing:.01em;color:var(--review-shell-text);white-space:nowrap}#page-count{padding-left:8px;border-left:1px solid var(--review-shell-border);color:var(--review-shell-muted);font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
    .tool{appearance:none;display:grid;place-items:center;min-width:26px;height:24px;padding:0 7px;border:1px solid transparent;border-radius:5px;color:var(--review-shell-muted);background:transparent;cursor:pointer;font-size:12px;line-height:1;transition:color .18s ease,border-color .18s ease,background-color .18s ease}.tool:hover{color:var(--review-shell-text);background:var(--review-shell-hover)}#pick{gap:5px;grid-auto-flow:column;width:auto;border-color:color-mix(in srgb,var(--review-shell-primary) 24%,transparent);color:var(--review-shell-primary);background:var(--review-shell-primary-soft)}#pick:hover{border-color:color-mix(in srgb,var(--review-shell-primary) 42%,transparent);color:var(--review-shell-primary);background:color-mix(in srgb,var(--review-shell-primary) 17%,transparent)}#close:hover{color:var(--review-shell-danger-text);background:var(--review-shell-danger-bg)}
    #workbench{display:block;width:100%;height:calc(100% - 36px);overflow:hidden;background:var(--review-shell-bg)}#loading{height:100%;display:grid;place-items:center;padding:24px;color:var(--review-shell-muted);font-size:12px;font-weight:600;line-height:1.5}#loading[data-error]{color:var(--review-shell-danger-text)}
    #resizer{position:absolute;z-index:2;left:16px;right:16px;top:-6px;height:12px;cursor:ns-resize;touch-action:none}#resizer::after{content:"";position:absolute;left:50%;top:4px;width:44px;height:3px;border-radius:999px;background:var(--review-shell-border);transform:translateX(-50%);transition:background .16s ease}#resizer:hover::after,#resizer:focus-visible::after{background:var(--review-shell-accent)}#resizer:focus-visible{outline:none}
    #highlighter{position:fixed;z-index:4;pointer-events:none;border:2px solid var(--review-highlight-border);border-radius:4px;background:var(--review-highlight-bg);outline:1px solid color-mix(in srgb,var(--review-highlight-border) 38%,transparent);outline-offset:2px;box-shadow:0 0 0 3px color-mix(in srgb,var(--review-highlight-border) 18%,transparent),0 0 28px color-mix(in srgb,var(--review-highlight-border) 28%,transparent);transform:translateZ(0)}#highlighter::before,#highlighter::after{content:"";position:absolute;width:7px;height:7px;border:2px solid var(--review-highlight-border);background:var(--review-shell-bg)}#highlighter::before{left:-5px;top:-5px}#highlighter::after{right:-5px;bottom:-5px}#highlighter:not([hidden]){animation:review-locate-pulse .72s ease-out 2}@keyframes review-locate-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--review-highlight-border) 42%,transparent),0 0 12px color-mix(in srgb,var(--review-highlight-border) 14%,transparent)}100%{box-shadow:0 0 0 8px transparent,0 0 32px color-mix(in srgb,var(--review-highlight-border) 30%,transparent)}}
    [hidden]{display:none!important}@media(max-width:640px){#launcher{right:12px;bottom:12px}}@media(prefers-reduced-motion:reduce){#launcher,.tool,#resizer::after{transition:none}#highlighter:not([hidden]){animation:none}}
  </style>
  <button id="launcher" type="button" aria-label="${copy.open}" title="${copy.open}">${brandIconMarkup('launcher-icon')}</button>
  <section id="panel" hidden aria-label="${copy.frame}">
    <div id="resizer" role="separator" tabindex="0" aria-orientation="horizontal" aria-label="${copy.resize}"></div>
    <header id="toolbar">
      <div id="identity"><span id="brand">${brandIconMarkup('toolbar-icon')}</span><span id="title">${copy.title}</span><span id="page-count">${copy.currentPage} 0</span></div>
      <nav id="tools" aria-label="${copy.frame}">
        <button class="tool" id="pick" type="button" title="${copy.pick}"><span aria-hidden="true">◎</span><span>${copy.pick}</span></button>
        <button class="tool" id="close" type="button" title="${copy.close}" aria-label="${copy.close}">×</button>
      </nav>
    </header>
    <div id="workbench"><div id="loading" role="status">${copy.loading}</div></div>
  </section>
  <div id="highlighter" hidden></div>`;
}

function brandIconMarkup(id: string): string {
  // 图标只使用路径，避免操作系统字体差异破坏小尺寸下的清晰度。
  return `<svg id="${id}" class="brand-icon" viewBox="0 0 40 40" role="presentation" aria-hidden="true"><defs><linearGradient id="${id}-ink" x1="8" y1="8" x2="32" y2="31" gradientUnits="userSpaceOnUse"><stop stop-color="#38bdf8"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs><path d="M8.5 7.5h19a5.5 5.5 0 0 1 5.5 5.5v9.5a5.5 5.5 0 0 1-5.5 5.5H18l-7 5v-5H8.5A4.5 4.5 0 0 1 4 23.5V12a4.5 4.5 0 0 1 4.5-4.5Z" fill="url(#${id}-ink)"/><path d="M11.5 14.5h13M11.5 19h8" fill="none" stroke="#fff" stroke-width="2.25" stroke-linecap="round" opacity=".92"/><circle cx="29" cy="27.5" r="6.25" fill="#0f172a" stroke="#fff" stroke-width="1.5"/><path d="m26.2 27.5 1.8 1.8 3.8-4.2" fill="none" stroke="#5eead4" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
