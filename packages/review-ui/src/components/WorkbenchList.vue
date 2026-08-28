<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  useTemplateRef,
  watch,
} from 'vue';
import type { ReviewMessage } from '@ai-i18n/core';
import type { ReviewCopy } from '@ai-i18n/core/review-i18n';
import { messageKey } from '../review-state';
import {
  scrollTopForIndex,
  useVirtualList,
} from '../composables/useVirtualList';
import WorkbenchListItem from './WorkbenchListItem.vue';

const props = defineProps<{
  copy: ReviewCopy;
  locale: string;
  messages: readonly ReviewMessage[];
  selectedKey: string | null;
}>();

const emit = defineEmits<{ select: [message: ReviewMessage] }>();
// 虚拟列表高度必须与 WorkbenchListItem 的固定高度保持一致。
const ITEM_HEIGHT = 92;
const viewport = useTemplateRef<HTMLElement>('viewport');
const { range, visibleItems, updateViewport } = useVirtualList(
  () => props.messages,
  { itemHeight: ITEM_HEIGHT },
);
let observer: ResizeObserver | undefined;

function revealSelected(): void {
  const element = viewport.value;
  if (!element || !props.selectedKey) return;
  const index = props.messages.findIndex(
    (message) => messageKey(message.message) === props.selectedKey,
  );
  const scrollTop = scrollTopForIndex(
    index,
    props.messages.length,
    { height: element.clientHeight, scrollTop: element.scrollTop },
    ITEM_HEIGHT,
  );
  if (scrollTop !== element.scrollTop) element.scrollTop = scrollTop;
  updateViewport({ height: element.clientHeight, scrollTop });
}

onMounted(() => {
  if (!viewport.value) return;
  observer = new ResizeObserver(([entry]) => {
    updateViewport({
      height: entry?.contentRect.height ?? viewport.value?.clientHeight ?? 0,
      scrollTop: viewport.value?.scrollTop ?? 0,
    });
    revealSelected();
  });
  observer.observe(viewport.value);
  updateViewport({
    height: viewport.value.clientHeight,
    scrollTop: viewport.value.scrollTop,
  });
});

watch(
  () => props.selectedKey,
  async () => {
    await nextTick();
    revealSelected();
  },
  { flush: 'post' },
);

onBeforeUnmount(() => observer?.disconnect());

function updateScroll(event: Event): void {
  const element = event.currentTarget as HTMLElement;
  updateViewport({
    height: element.clientHeight,
    scrollTop: element.scrollTop,
  });
}
</script>

<template>
  <div
    ref="viewport"
    class="flex-1 min-h-0 overflow-y-auto border-t border-line"
    role="list"
    @scroll="updateScroll"
  >
    <div class="relative" :style="{ height: `${range.totalHeight}px` }">
      <div
        class="absolute inset-x-0 top-0 bottom-auto"
        :style="{ transform: `translateY(${range.offset}px)` }"
      >
        <WorkbenchListItem
          v-for="{ index, item } in visibleItems"
          :key="messageKey(item.message)"
          :copy="copy"
          :locale="locale"
          :message="item"
          :selected="selectedKey === messageKey(item.message)"
          :aria-posinset="index + 1"
          :aria-setsize="messages.length"
          @select="emit('select', item)"
        />
      </div>
    </div>
  </div>
</template>
