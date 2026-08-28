import { onMounted, onUnmounted } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import { messageKey } from '../review-state';

interface ReviewKeyboardNavigationOptions {
  active: () => boolean;
  messages: () => readonly ReviewMessage[];
  onUseAutomatic: () => boolean;
  select: (message: ReviewMessage) => void;
  selectedKey: () => string | null;
}

/** 集中管理跨列表与编辑器的工作台快捷键，避免视图组件直接持有窗口副作用。 */
export function useReviewKeyboardNavigation(
  options: ReviewKeyboardNavigationOptions,
): void {
  function handleKeyDown(event: KeyboardEvent): void {
    if (!options.active()) return;
    const isInputTarget = event
      .composedPath()
      .some(
        (target) =>
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement,
      );

    if (
      !isInputTarget &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      const messages = options.messages();
      if (!messages.length) return;
      const selectedKey = options.selectedKey();
      const index = selectedKey
        ? messages.findIndex(
            (message) => messageKey(message.message) === selectedKey,
          )
        : -1;
      const next =
        index === -1 ? 0 : event.key === 'ArrowDown' ? index + 1 : index - 1;
      if (next >= 0 && next < messages.length) {
        options.select(messages[next]!);
        event.preventDefault();
      }
    }

    if (event.altKey && event.code === 'KeyA') {
      if (options.onUseAutomatic()) event.preventDefault();
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeyDown));
  onUnmounted(() => window.removeEventListener('keydown', handleKeyDown));
}
