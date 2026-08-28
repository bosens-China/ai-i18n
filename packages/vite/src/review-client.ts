import type { ReviewSnapshot, ReviewWorkbenchSelection } from '@ai-i18n/core';
import {
  createReviewValueIndex,
  matchReviewValue,
  uniqueReviewTarget,
  type ReviewClientTarget,
} from './review-client-matcher.js';
import { createReviewPanelShell } from './review-client-panel.js';
import { reviewLocateScrollDelta } from './review-client-locate.js';

const REVIEW_TARGETS = Symbol.for('ai-i18n.review.targets');
const TRANSLATED_ATTRIBUTES = [
  'alt',
  'aria-label',
  'placeholder',
  'title',
] as const;

interface ReviewNode extends Node {
  [REVIEW_TARGETS]?: ReviewClientTarget[];
}

interface ReviewFragment {
  element: Element;
  value: string;
}

export interface MountReviewOverlayOptions {
  workbenchModule: string;
}

export function mountReviewOverlay(options: MountReviewOverlayOptions): void {
  if (typeof document === 'undefined') return;
  const mount = () => mountReadyOverlay(options);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}

function mountReadyOverlay(options: MountReviewOverlayOptions): void {
  const body = document.body;
  if (!body) return;
  if (document.querySelector('ai-i18n-review')) return;
  let refreshTimer: number | undefined;
  let highlightTimer: number | undefined;
  let picking = false;
  let previousCursor = '';
  const shell = createReviewPanelShell({
    workbenchModule: options.workbenchModule,
    onDestroy: cleanup,
    onLocateMessage: locateMessage,
    onOpen: () => void refreshContext(),
    onPick: startPicking,
  });
  const { host } = shell;

  let snapshot: ReviewSnapshot | undefined;
  let context: string[] = [];
  let requestSequence = 0;

  async function refreshContext(): Promise<void> {
    const request = ++requestSequence;
    try {
      const response = await fetch('/__ai-i18n/api/messages', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const next = (await response.json()) as ReviewSnapshot;
      if (request !== requestSequence) return;
      snapshot = next;
      context = scanPageMessageKeys(next, host);
      shell.updateCount(context.length);
      shell.setPageMessageKeys(context);
    } catch {
      // 工作台会显示 API 错误；悬浮入口本身保持安静，避免污染业务控制台。
    }
  }

  function scheduleRefresh(): void {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => void refreshContext(), 180);
  }

  function clearHighlight(): void {
    window.clearTimeout(highlightTimer);
    highlightTimer = undefined;
    shell.clearHighlight();
  }

  function stopPicking(clear = true): void {
    if (clear) clearHighlight();
    if (!picking) return;
    picking = false;
    document.documentElement.style.cursor = previousCursor;
    document.removeEventListener('pointermove', highlightTarget, true);
    document.removeEventListener('click', selectTarget, true);
    document.removeEventListener('keydown', cancelPicker, true);
  }

  function startPicking(): void {
    if (picking) return;
    clearHighlight();
    picking = true;
    previousCursor = document.documentElement.style.cursor;
    document.documentElement.style.cursor = 'crosshair';
    shell.hide();
    document.addEventListener('pointermove', highlightTarget, true);
    document.addEventListener('click', selectTarget, true);
    document.addEventListener('keydown', cancelPicker, true);
  }

  function highlightTarget(event: PointerEvent): void {
    const target = businessTargetAtPoint(event.clientX, event.clientY, host);
    if (!target) {
      shell.clearHighlight();
      return;
    }
    shell.highlight(target.getBoundingClientRect());
  }

  function selectTarget(event: MouseEvent): void {
    const target = businessTargetAtPoint(event.clientX, event.clientY, host);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    event.preventDefault();
    event.stopImmediatePropagation();
    const selection = selectionForElement(target, snapshot);
    stopPicking(false);
    shell.open();
    shell.setSelection(selection);
    // 点击后短暂保留描边，让用户明确看到工作台定位到的页面元素。
    shell.highlight(rect);
    highlightTimer = window.setTimeout(clearHighlight, 1_600);
  }

  function locateMessage(messageKey: string): void {
    if (!snapshot) return;
    const target = pageElementForMessage(snapshot, messageKey, host);
    if (!target) return;
    clearHighlight();
    const reducedMotion = globalThis.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const delta = reviewLocateScrollDelta(
      target.getBoundingClientRect(),
      shell.pageViewportBottom(),
    );
    if (Math.abs(delta) > 1) {
      window.scrollBy({
        top: delta,
        behavior: reducedMotion ? 'auto' : 'smooth',
      });
    }
    highlightTimer = window.setTimeout(
      () => {
        shell.highlight(target.getBoundingClientRect());
        highlightTimer = window.setTimeout(clearHighlight, 1_600);
      },
      reducedMotion ? 0 : 360,
    );
  }

  function cancelPicker(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    stopPicking();
    shell.showLauncher();
  }

  function cleanup(): void {
    window.clearTimeout(refreshTimer);
    clearHighlight();
    observer.disconnect();
    stopPicking();
  }

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(body, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  void refreshContext();
}

function scanPageMessageKeys(
  snapshot: ReviewSnapshot,
  host: HTMLElement,
): string[] {
  const index = createReviewValueIndex(snapshot);
  const keys = new Set<string>();
  for (const fragment of reviewFragments(document, host)) {
    for (const key of matchReviewValue(index, fragment.value)) keys.add(key);
  }
  return [...keys];
}

function pageElementForMessage(
  snapshot: ReviewSnapshot,
  messageKey: string,
  host: HTMLElement,
): Element | undefined {
  const index = createReviewValueIndex(snapshot);
  for (const fragment of reviewFragments(document, host)) {
    if (
      elementReviewTargets(fragment.element).some(
        (target) => target.key === messageKey,
      ) ||
      matchReviewValue(index, fragment.value).includes(messageKey)
    ) {
      return fragment.element;
    }
  }
  return undefined;
}

function selectionForElement(
  element: Element,
  snapshot: ReviewSnapshot | undefined,
): ReviewWorkbenchSelection {
  if (!snapshot) {
    return { candidateKeys: [] };
  }
  const index = createReviewValueIndex(snapshot);
  let current: Element | null = element;
  while (current && current !== document.body) {
    const exactTargets = elementReviewTargets(current);
    if (exactTargets.length) {
      return {
        candidateKeys: [...new Set(exactTargets.map((target) => target.key))],
        ...(exactTargets.length === 1 ? { exact: exactTargets[0] } : {}),
      };
    }
    const candidateKeys = new Set<string>();
    for (const fragment of reviewFragments(current)) {
      for (const key of matchReviewValue(index, fragment.value)) {
        candidateKeys.add(key);
      }
    }
    const keys = [...candidateKeys];
    if (keys.length) {
      const exact = uniqueReviewTarget(snapshot, keys);
      return {
        candidateKeys: keys,
        ...(exact ? { exact } : {}),
      };
    }
    current = current.parentElement;
  }
  return { candidateKeys: [] };
}

function reviewFragments(
  root: Document | Element,
  host?: HTMLElement,
): ReviewFragment[] {
  const fragments: ReviewFragment[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node: Node | null = root instanceof Element ? root : walker.nextNode();
  while (node) {
    const element = node as Element;
    if (element !== host && isReviewableElement(element, host)) {
      for (const attribute of TRANSLATED_ATTRIBUTES) {
        const value = element.getAttribute(attribute);
        if (value) fragments.push({ element, value });
      }
      if (
        element instanceof HTMLInputElement &&
        ['button', 'submit', 'reset'].includes(element.type) &&
        element.value
      ) {
        fragments.push({ element, value: element.value });
      }
      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.nodeValue?.trim()) {
          fragments.push({ element, value: child.nodeValue });
        }
      }
    }
    node = walker.nextNode();
  }
  return fragments;
}

function isReviewableElement(element: Element, host?: HTMLElement): boolean {
  if (host && (element === host || host.contains(element))) return false;
  if (
    element.closest(
      'script, style, noscript, template, [hidden], [aria-hidden="true"]',
    )
  )
    return false;
  return element.getClientRects().length > 0;
}

function elementReviewTargets(element: Element): ReviewClientTarget[] {
  const targets: ReviewClientTarget[] = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node: Node | null = element;
  while (node) {
    for (const target of (node as ReviewNode)[REVIEW_TARGETS] ?? []) {
      const identity = `${target.key}\0${target.file}\0${target.location.line}:${target.location.column}`;
      if (
        !targets.some(
          (item) =>
            `${item.key}\0${item.file}\0${item.location.line}:${item.location.column}` ===
            identity,
        )
      ) {
        targets.push(target);
      }
    }
    node = walker.nextNode();
  }
  return targets;
}

function businessTargetAtPoint(
  clientX: number,
  clientY: number,
  host: HTMLElement,
): Element | undefined {
  // 用实时命中测试而不是事件 target，避免 Shadow DOM 或业务事件层把目标重定向后丢失描边。
  return document
    .elementsFromPoint(clientX, clientY)
    .find((element) => element !== host && !host.contains(element));
}
