import {
  parseReviewPanelPreferences,
  resizeReviewPanel,
  reviewPanelSize,
  type ReviewPanelDock,
  type ReviewPanelPreferences,
} from './review-client-layout.js';
import type {
  ReviewWorkbenchController,
  ReviewWorkbenchModule,
  ReviewWorkbenchSelection,
} from './review-workbench.js';

const STORAGE_KEY = 'ai-i18n.review.panel.v1';
const ELEMENT_NAME = 'ai-i18n-review';

interface ReviewPanelOptions {
  workbenchModule: string;
  onDestroy?: () => void;
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
  setPageMessageKeys(messageKeys: readonly string[]): void;
  setSelection(selection: ReviewWorkbenchSelection): void;
  showLauncher(): void;
  updateCount(count: number): void;
}

interface OverlayCopy {
  close: string;
  currentPage: string;
  dockBottom: string;
  dockRight: string;
  failed: string;
  frame: string;
  full: string;
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
  shadow.innerHTML = overlayMarkup(
    copy,
    workbenchStyle(options.workbenchModule),
  );
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

  function applyLayout(): void {
    panel.dataset.dock = preferences.dock;
    panel.style.setProperty(
      '--review-bottom-size',
      `${reviewPanelSize(preferences, 'bottom', viewport())}px`,
    );
    panel.style.setProperty(
      '--review-right-size',
      `${reviewPanelSize(preferences, 'right', viewport())}px`,
    );
    for (const button of Array.from(
      shadow.querySelectorAll<HTMLButtonElement>('[data-dock]'),
    )) {
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.dock === preferences.dock),
      );
    }
  }

  function setDock(dock: ReviewPanelDock): void {
    preferences = { ...preferences, dock };
    applyLayout();
    savePreferences(preferences);
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
        controller = module.mountReviewWorkbench(workbench);
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
    if (preferences.dock === 'full') return;
    resizing = true;
    previousCursor = document.documentElement.style.cursor;
    previousUserSelect = document.documentElement.style.userSelect;
    document.documentElement.style.cursor =
      preferences.dock === 'bottom' ? 'ns-resize' : 'ew-resize';
    document.documentElement.style.userSelect = 'none';
    resizer.setPointerCapture(event.pointerId);
  }

  function resize(event: PointerEvent): void {
    if (!resizing || preferences.dock === 'full') return;
    preferences = resizeReviewPanel(
      preferences,
      preferences.dock,
      { x: event.clientX, y: event.clientY },
      viewport(),
    );
    applyLayout();
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
  for (const button of Array.from(
    shadow.querySelectorAll<HTMLButtonElement>('[data-dock]'),
  )) {
    button.addEventListener('click', () => {
      const dock = button.dataset.dock;
      if (dock === 'bottom' || dock === 'right' || dock === 'full') {
        setDock(dock);
      }
    });
  }
  resizer.addEventListener('pointerdown', startResize);
  resizer.addEventListener('pointermove', resize);
  resizer.addEventListener('pointerup', stopResize);
  resizer.addEventListener('pointercancel', stopResize);
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
  return { width: window.innerWidth, height: window.innerHeight };
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
        dockBottom: '停靠到底部',
        dockRight: '停靠到右侧',
        failed: '工作台加载失败，请查看 Vite 控制台后重试。',
        frame: '翻译校对工作台',
        full: '全屏工作台',
        loading: '正在加载翻译校对工作台…',
        open: '打开翻译校对',
        pick: '点选页面文案',
        resize: '调整工作台尺寸',
        title: '翻译校对',
      }
    : {
        close: 'Close workbench',
        currentPage: 'Page',
        dockBottom: 'Dock to bottom',
        dockRight: 'Dock to right',
        failed:
          'Failed to load the workbench. Check the Vite console and retry.',
        frame: 'Translation review workbench',
        full: 'Full-screen workbench',
        loading: 'Loading translation review workbench…',
        open: 'Open translation review',
        pick: 'Pick page copy',
        resize: 'Resize workbench',
        title: 'Translation review',
      };
}

function workbenchStyle(modulePath: string): string {
  return modulePath.endsWith('.js')
    ? `${modulePath.slice(0, -3)}.css`
    : `${modulePath}.css`;
}

function overlayMarkup(copy: OverlayCopy, stylePath: string): string {
  return `<style>
    :host{all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#e5edf8}
    *{box-sizing:border-box}button{font:inherit}
    #launcher{pointer-events:auto;position:fixed;right:16px;bottom:16px;width:44px;height:44px;border:1px solid #334155;border-radius:12px;color:#dff8ff;background:#111827;box-shadow:0 12px 36px rgb(2 6 23/.42),inset 0 1px rgb(255 255 255/.08);cursor:pointer;display:grid;place-items:center;transition:transform .16s ease,border-color .16s ease,background .16s ease}
    #launcher:hover{transform:translateY(-2px);border-color:#22d3ee;background:#162032}#launcher:focus-visible,.tool:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}
    #launcher-mark{font-size:16px;font-weight:850;line-height:1;color:#f8fafc}#launcher-dot{position:absolute;width:7px;height:7px;right:7px;top:7px;border:2px solid #111827;border-radius:50%;background:#22d3ee}
    #panel{pointer-events:auto;position:fixed;overflow:hidden;border:1px solid #334155;border-radius:11px;background:#0b0f19;box-shadow:0 22px 72px rgb(2 6 23/.58)}
    #panel[data-dock="bottom"]{left:12px;right:12px;bottom:12px;height:var(--review-bottom-size)}#panel[data-dock="right"]{top:12px;right:12px;bottom:12px;width:var(--review-right-size)}#panel[data-dock="full"]{inset:12px}
    #toolbar{height:34px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 7px 0 10px;border-bottom:1px solid #1e293b;background:#111827;user-select:none}
    #identity,#tools{display:flex;align-items:center;min-width:0}#identity{gap:8px}#tools{gap:2px}
    #brand{display:grid;place-items:center;width:19px;height:19px;border:1px solid rgb(34 211 238/.5);border-radius:5px;color:#67e8f9;background:rgb(6 182 212/.08);font-size:10px;font-weight:850}
    #title{font-size:11px;font-weight:750;letter-spacing:.01em;color:#e5edf8;white-space:nowrap}#page-count{padding-left:8px;border-left:1px solid #334155;color:#7f8ea3;font:600 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
    .tool{appearance:none;display:grid;place-items:center;min-width:26px;height:24px;padding:0 7px;border:1px solid transparent;border-radius:5px;color:#91a0b5;background:transparent;cursor:pointer;font-size:12px;line-height:1}.tool:hover{color:#f8fafc;background:#1e293b}.tool[aria-pressed="true"]{color:#67e8f9;border-color:rgb(34 211 238/.28);background:rgb(6 182 212/.09)}#pick{gap:5px;grid-auto-flow:column;width:auto;color:#bfdbfe}#close:hover{color:#fca5a5;background:rgb(127 29 29/.24)}
    #workbench{display:block;width:100%;height:calc(100% - 34px);overflow:hidden;background:#0b0f19}#loading{height:100%;display:grid;place-items:center;padding:24px;color:#7f8ea3;font:600 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}#loading[data-error]{color:#fca5a5}
    #resizer{position:absolute;z-index:2}#panel[data-dock="bottom"] #resizer{left:16px;right:16px;top:-4px;height:9px;cursor:ns-resize}#panel[data-dock="right"] #resizer{top:16px;bottom:16px;left:-4px;width:9px;cursor:ew-resize}#panel[data-dock="full"] #resizer{display:none}
    #highlighter{position:fixed;pointer-events:none;border:2px solid #22d3ee;border-radius:5px;background:rgb(34 211 238/.07);box-shadow:0 0 0 3px rgb(6 182 212/.16),0 0 24px rgb(34 211 238/.2)}
    [hidden]{display:none!important}@media(prefers-reduced-motion:reduce){#launcher{transition:none}}@media(max-width:720px),(max-height:520px){#panel{inset:0!important;width:100vw!important;height:100vh!important;border:0;border-radius:0}#resizer,.tool[data-dock]{display:none!important}}
  </style>
  <button id="launcher" type="button" aria-label="${copy.open}" title="${copy.open}"><span id="launcher-mark">译</span><span id="launcher-dot"></span></button>
  <section id="panel" hidden data-dock="bottom" aria-label="${copy.frame}">
    <div id="resizer" role="separator" aria-label="${copy.resize}"></div>
    <header id="toolbar">
      <div id="identity"><span id="brand">译</span><span id="title">${copy.title}</span><span id="page-count">${copy.currentPage} 0</span></div>
      <nav id="tools" aria-label="${copy.frame}">
        <button class="tool" id="pick" type="button" title="${copy.pick}"><span aria-hidden="true">◎</span><span>${copy.pick}</span></button>
        <button class="tool" type="button" data-dock="bottom" title="${copy.dockBottom}" aria-label="${copy.dockBottom}">▰</button>
        <button class="tool" type="button" data-dock="right" title="${copy.dockRight}" aria-label="${copy.dockRight}">▮</button>
        <button class="tool" type="button" data-dock="full" title="${copy.full}" aria-label="${copy.full}">□</button>
        <button class="tool" id="close" type="button" title="${copy.close}" aria-label="${copy.close}">×</button>
      </nav>
    </header>
    <div id="workbench"><link rel="stylesheet" href="${stylePath}"><div id="loading" role="status">${copy.loading}</div></div>
  </section>
  <div id="highlighter" hidden></div>`;
}
