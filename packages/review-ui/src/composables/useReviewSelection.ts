import { computed, readonly, shallowRef, watch } from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import { messageKey } from '../review-state';

export function useReviewSelection(messages: () => readonly ReviewMessage[]) {
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
      if (
        selectedKey.value !== null &&
        items.some(
          (message) => messageKey(message.message) === selectedKey.value,
        )
      ) {
        return;
      }
      selectedKey.value = items[0] ? messageKey(items[0].message) : null;
    },
    { immediate: true },
  );

  function select(message: ReviewMessage): void {
    selectedKey.value = messageKey(message.message);
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
    selectNext,
  };
}
