import { computed, readonly, shallowRef, watch } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import { messageKey } from '../review-state';

interface ReviewSelectionOptions {
  autoSelect?: () => boolean;
}

export function useReviewSelection(
  messages: () => readonly ReviewMessage[],
  options: ReviewSelectionOptions = {},
) {
  const selectedKey = shallowRef<string | null>(null);
  const selectedMessage = computed(
    () =>
      messages().find(
        (message) => messageKey(message.message) === selectedKey.value,
      ) ?? null,
  );

  watch(
    messages,
    (items) => {
      if (!items.length) return;
      if (
        selectedKey.value !== null &&
        items.some(
          (message) => messageKey(message.message) === selectedKey.value,
        )
      ) {
        return;
      }
      selectedKey.value =
        options.autoSelect?.() === false
          ? null
          : items[0]
            ? messageKey(items[0].message)
            : null;
    },
    { immediate: true },
  );

  function select(message: ReviewMessage): void {
    selectedKey.value = messageKey(message.message);
  }

  function selectKey(key: string): void {
    selectedKey.value = key;
  }

  function clear(): void {
    selectedKey.value = null;
  }

  function selectNext(after: ReviewMessage): void {
    const items = messages();
    const index = items.findIndex(
      (message) => messageKey(message.message) === messageKey(after.message),
    );
    select(items[index + 1] ?? items[0] ?? after);
  }

  return {
    selectedKey: readonly(selectedKey),
    selectedMessage,
    select,
    selectKey,
    clear,
    selectNext,
  };
}
