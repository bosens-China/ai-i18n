import { overlayMarkup } from './review-client-markup.js';
export { REVIEW_CLIENT_FONT_STACK } from './review-client-markup.js';
import {
  REVIEW_UI_LANGUAGE_CHANGE_EVENT,
  REVIEW_UI_THEME_CHANGE_EVENT,
  readResolvedReviewUiLanguage,
  readResolvedReviewUiTheme,
  readReviewUiThemePreference,
  resolveReviewUiTheme,
  type ReviewUiTheme,
  type ReviewWorkbenchController,
  type ReviewWorkbenchModule,
  type ReviewWorkbenchSelection,
} from '@ai-i18n/core';
import { diagnosticMessage } from '@ai-i18n/core/diagnostics';
import {
  parseReviewPanelPreferences,
  resizeReviewPanelHeight,
  reviewPanelHeight,
  type ReviewPanelPreferences,
} from './review-client-layout.js';
import {
  reviewOverlayCopy,
  type ReviewOverlayCopy,
} from './review-client-copy.js';

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

export function createReviewPanelShell(
  options: ReviewPanelOptions,
): ReviewPanelShell {
  let copy = reviewOverlayCopy(readResolvedReviewUiLanguage());
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
  let pageCount = 0;
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

  function onLanguageChange(event: Event): void {
    const detail = (event as CustomEvent<{ language?: 'en-US' | 'zh-CN' }>)
      .detail;
    updateOverlayCopy(
      reviewOverlayCopy(detail?.language ?? readResolvedReviewUiLanguage()),
    );
  }

  function updateOverlayCopy(next: ReviewOverlayCopy): void {
    copy = next;
    launcher.setAttribute('aria-label', copy.openReview);
    launcher.title = copy.openReview;
    panel.setAttribute('aria-label', copy.workbenchFrame);
    resizer.setAttribute('aria-label', copy.resizeWorkbench);
    requiredElement<HTMLElement>(shadow, '#title').textContent =
      copy.reviewTitle;
    const pick = requiredElement<HTMLButtonElement>(shadow, '#pick');
    pick.title = copy.pickFromPage;
    requiredElement<HTMLElement>(pick, 'span:last-child').textContent =
      copy.pickFromPage;
    const closeButton = requiredElement<HTMLButtonElement>(shadow, '#close');
    closeButton.title = copy.closeWorkbench;
    closeButton.setAttribute('aria-label', copy.closeWorkbench);
    count.textContent = copy.currentPageSummary(pageCount);
    if (!loading.hasAttribute('data-error')) {
      loading.textContent = copy.workbenchLoading;
    }
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
  document.addEventListener(REVIEW_UI_LANGUAGE_CHANGE_EVENT, onLanguageChange);
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
          throw new TypeError(
            diagnosticMessage(
              '缺少 mountReviewWorkbench 导出。',
              'Missing mountReviewWorkbench export.',
            ),
          );
        }
        if (destroyed) {
          throw new Error(
            diagnosticMessage(
              'Review 宿主已移除。',
              'Review host was removed.',
            ),
          );
        }
        controller = module.mountReviewWorkbench(workbench, {
          onLocateMessage: options.onLocateMessage,
        });
        controller.setPageMessageKeys(pageMessageKeys);
        if (selection) controller.setSelection(selection);
        loading.hidden = true;
        return controller;
      })
      .catch((cause: unknown) => {
        loading.textContent = copy.workbenchLoadFailed;
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
    document.removeEventListener(
      REVIEW_UI_LANGUAGE_CHANGE_EVENT,
      onLanguageChange,
    );
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
      pageCount = value;
      count.textContent = copy.currentPageSummary(pageCount);
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
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(
      diagnosticMessage(
        `缺少 Review 面板元素：${selector}。`,
        `Missing review panel element: ${selector}.`,
      ),
    );
  }
  return element;
}
